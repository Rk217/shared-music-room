import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, Platform } from 'react-native';
import TrackPlayer, {
  PlayerCommand,
  Event,
  useIsPlaying,
  useProgress,
} from '@rntp/player';
import Slider from '@react-native-community/slider';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/firebase';
import { supabase } from '@/supabase';

interface Song {
  id: string;
  title: string;
  url: string;
  upvotes?: number;
  createdAt?: any;
}

const DEMO_SONGS: Song[] = [
  {
    id: 'demo-1',
    title: 'Acoustic Breeze (Demo)',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    upvotes: 5,
  },
  {
    id: 'demo-2',
    title: 'Chiptune Groove (Demo)',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    upvotes: 2,
  },
];

let playerSetupPromise: Promise<void> | null = null;

function setupPlayer() {
  if (!playerSetupPromise) {
    playerSetupPromise = (async () => {
      TrackPlayer.setupPlayer();

      TrackPlayer.setCommands({
        capabilities: [
          PlayerCommand.PlayPause,
          PlayerCommand.Next,
          PlayerCommand.Previous,
          PlayerCommand.Seek,
        ],
      });
    })().catch((error: unknown) => {
      playerSetupPromise = null;
      throw error;
    });
  }

  return playerSetupPromise;
}

export default function App() {
  const [songs, setSongs] = useState<Song[]>(DEMO_SONGS);
  const [title, setTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const isPlaying = useIsPlaying();
  const progress = useProgress();

  useEffect(() => {
    let active = true;
    void setupPlayer().then(() => {
      if (active) setPlayerReady(true);
    }).catch((error: unknown) => {
      console.error('Unable to initialize Track Player:', error);
      if (active) setPlayerError('Audio playback could not be initialized.');
    });
    return () => {
      active = false;
    };
  }, []);

  // Fetch and real-time sync with Firebase fallback
  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }

    try {
      const q = query(collection(db, 'songs'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const songList: Song[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Song, 'id'>),
          }));
          songList.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
          setSongs(songList.length > 0 ? songList : DEMO_SONGS);
        },
        (error) => {
          console.warn('Firebase sync warning:', error);
          setSongs(DEMO_SONGS);
        }
      );
      return () => unsubscribe();
    } catch (e) {
      console.warn('Firestore fallback:', e);
    }
  }, []);

  useEffect(() => {
    if (!playerReady) return;

    const activeTrackSubscription = TrackPlayer.addEventListener(
      Event.MediaItemTransition,
      ({ item }) =>
        setPlayingId(typeof item?.mediaId === 'string' ? item.mediaId : null)
    );

    return () => {
      activeTrackSubscription.remove();

    };
  }, [playerReady]);

  // Handle audio selection and Supabase Storage upload
  const pickAndUploadAudio = async () => {
    if (!isFirebaseConfigured) {
      Alert.alert(
        'Firebase Setup Needed',
        'Firebase must be configured to save song details to the shared catalog.'
      );
      return;
    }
    if (!supabase) {
      Alert.alert(
        'Supabase Setup Needed',
        'Add your Supabase project URL and publishable key to .env.local, then restart Expo.'
      );
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      const storagePath = `${Date.now()}_${file.name.replace(/[^\w.-]+/g, '_')}`;

      setUploading(true);

      const fileBody = Platform.OS === 'web'
        ? file.file
        : await new ExpoFile(file.uri).arrayBuffer();
      if (!fileBody) {
        throw new Error('Unable to read the selected audio file.');
      }

      const { data: uploadedFile, error: uploadError } = await supabase.storage
        .from('songs')
        .upload(storagePath, fileBody, {
          contentType: file.mimeType ?? 'audio/mpeg',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicFile } = supabase.storage
        .from('songs')
        .getPublicUrl(uploadedFile.path);

      await addDoc(collection(db, 'songs'), {
        title: title.trim() || file.name.replace(/\.mp3$/i, ''),
        url: publicFile.publicUrl,
        upvotes: 0,
        createdAt: serverTimestamp(),
      });

      setTitle('');
      Alert.alert('Success', 'Song uploaded successfully!');
    } catch (error) {
      console.error('Upload Error:', error);
      Alert.alert('Upload Error', 'Could not upload the song. Check the Supabase songs bucket and its upload policy, plus Firestore access.');
    } finally {
      setUploading(false);
    }
  };

  const upvoteSong = async (id: string, currentVotes?: number) => {
    if (!isFirebaseConfigured || id.startsWith('demo-')) {
      setSongs((prev) =>
        [...prev]
          .map((s) => (s.id === id ? { ...s, upvotes: (s.upvotes || 0) + 1 } : s))
          .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
      );
      return;
    }
    await updateDoc(doc(db, 'songs', id), { upvotes: (currentVotes || 0) + 1 }).catch(() => {});
  };

  const deleteSong = async (id: string) => {
    if (playingId === id) {
      TrackPlayer.clear();
      setPlayingId(null);
    } else if (playerReady) {
      const queue = TrackPlayer.getQueue();
      const trackIndex = queue.findIndex((track) => track.mediaId === id);
      if (trackIndex !== -1) TrackPlayer.removeMediaItem(trackIndex);
    }

    if (!isFirebaseConfigured || id.startsWith('demo-')) {
      setSongs((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    await deleteDoc(doc(db, 'songs', id)).catch((err) => console.error('Delete error:', err));
  };

  const togglePlayback = async () => {
    if (!playerReady) {
      Alert.alert('Player unavailable', playerError ?? 'The audio engine is still starting.');
      return;
    }

    try {
      if (isPlaying) {
        await TrackPlayer.pause();
      } else {
        await TrackPlayer.play();
      }
    } catch (error) {
      console.warn('Playback toggle error:', error);
      Alert.alert('Playback Notice', 'Could not change playback state.');
    }
  };

  const playSong = async (song: Song) => {
    if (!playerReady) {
      Alert.alert('Player unavailable', playerError ?? 'The audio engine is still starting.');
      return;
    }

    try {
      if (playingId === song.id) {
        await togglePlayback();
        return;
      }

      const queue = songs.map((item) => ({
        mediaId: item.id,
        url: item.url,
        title: item.title,
        artist: 'Shared Music Room',
      }));
      const targetIndex = queue.findIndex((track) => track.mediaId === song.id);
      if (targetIndex === -1) return;

      await TrackPlayer.clear();
      TrackPlayer.setMediaItems(queue);
      TrackPlayer.skipToIndex(targetIndex);
      await TrackPlayer.play();
      setPlayingId(song.id);
    } catch (error) {
      console.warn('Playback error:', error);
      Alert.alert('Playback Notice', 'Could not play track. Please check audio stream accessibility.');
    }
  };

  const skipToAdjacentSong = async (direction: -1 | 1) => {
    const currentIndex = songs.findIndex((song) => song.id === playingId);
    const adjacentSong = songs[currentIndex + direction];
    if (adjacentSong) await playSong(adjacentSong);
  };

  const handleSeek = async (value: number) => {
    TrackPlayer.seekTo(value);
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const activeSong = songs.find((s) => s.id === playingId);
  const activeSongIndex = songs.findIndex((song) => song.id === playingId);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredSongs = songs.filter((song) =>
    song.title.toLocaleLowerCase().includes(normalizedSearchQuery)
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🎵 Shared Music Room</Text>

      {!isFirebaseConfigured && (
        <View style={styles.bannerContainer}>
          <Text style={styles.bannerText}>
            ⚠️ Firebase credentials in src/firebase.ts are unconfigured. Running in Demo Mode.
          </Text>
        </View>
      )}

      {playerError && <Text style={styles.errorText}>{playerError}</Text>}

      {/* Upload Form */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Custom Song Title (Optional)"
          value={title}
          onChangeText={setTitle}
        />

        {uploading ? (
          <View style={styles.uploadingBox}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.uploadingText}>Uploading audio file to Supabase...</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.uploadButton} onPress={pickAndUploadAudio}>
            <Text style={styles.buttonText}>📁 Pick & Upload MP3</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Song List */}
      <View style={styles.searchContainer}>
        <TextInput
          accessibilityLabel="Search songs"
          style={styles.searchInput}
          placeholder="Search songs"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={styles.clearSearchText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListEmptyComponent={<Text style={styles.emptyState}>No songs match your search.</Text>}
        renderItem={({ item }) => (
          <View style={styles.songCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.songTitle}>{item.title}</Text>
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={() => upvoteSong(item.id, item.upvotes)}>
                  <Text style={styles.upvoteText}>👍 {item.upvotes || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteSong(item.id)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.playButton, playingId === item.id && isPlaying && styles.playingButton]}
              onPress={() => playSong(item)}
            >
              <Text style={styles.playButtonText}>
                {playingId === item.id ? (isPlaying ? 'Pause' : 'Resume') : 'Play'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Bottom Player Banner */}
      {activeSong && (
        <View style={styles.nowPlayingContainer}>
          <Text style={styles.nowPlayingTitle}>
            {isPlaying ? 'Now Playing' : 'Paused'}: {activeSong.title}
          </Text>
          <View style={styles.transportRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Play previous song"
              disabled={activeSongIndex <= 0}
              onPress={() => skipToAdjacentSong(-1)}
              style={[styles.transportButton, activeSongIndex <= 0 && styles.disabledTransportButton]}
            >
              <Text style={styles.transportText}>Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause' : 'Resume'}
              onPress={togglePlayback}
              style={[styles.transportButton, styles.primaryTransportButton]}
            >
              <Text style={styles.primaryTransportText}>{isPlaying ? 'Pause' : 'Resume'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Play next song"
              disabled={activeSongIndex < 0 || activeSongIndex >= songs.length - 1}
              onPress={() => skipToAdjacentSong(1)}
              style={[styles.transportButton, (activeSongIndex < 0 || activeSongIndex >= songs.length - 1) && styles.disabledTransportButton]}
            >
              <Text style={styles.transportText}>Next</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.timeText}>{formatTime(progress.position)}</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={progress.duration || 1}
              value={progress.position}
              onSlidingComplete={handleSeek}
              minimumTrackTintColor="#007AFF"
              maximumTrackTintColor="#ddd"
              thumbTintColor="#007AFF"
            />
            <Text style={styles.timeText}>{formatTime(progress.duration)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 60, paddingHorizontal: 20 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  bannerContainer: { backgroundColor: '#fff3cd', borderColor: '#ffeeba', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 15 },
  bannerText: { color: '#856404', fontSize: 13, textAlign: 'center' },
  inputContainer: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 20, elevation: 2 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 5, marginBottom: 10 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', paddingHorizontal: 12, borderRadius: 6, marginBottom: 12, minHeight: 48 },
  searchInput: { flex: 1, paddingVertical: 10, color: '#222' },
  clearSearchText: { color: '#007AFF', fontWeight: '600', paddingVertical: 10 },
  emptyState: { color: '#666', textAlign: 'center', paddingVertical: 28 },
  uploadButton: { backgroundColor: '#007AFF', padding: 12, borderRadius: 5, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  uploadingBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10 },
  uploadingText: { marginLeft: 10, color: '#555' },
  songCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 1 },
  songTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  actionRow: { flexDirection: 'row', gap: 15 },
  upvoteText: { color: '#007AFF', fontSize: 14 },
  deleteText: { color: '#FF3B30', fontSize: 14 },
  playButton: { backgroundColor: '#34C759', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 5, marginLeft: 10 },
  playingButton: { backgroundColor: '#FF3B30' },
  playButtonText: { color: '#fff', fontWeight: 'bold' },
  nowPlayingContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 20, borderTopWidth: 1, borderColor: '#ddd', elevation: 10 },
  nowPlayingTitle: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  transportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 },
  transportButton: { minWidth: 82, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', borderRadius: 5, backgroundColor: '#eef1f4' },
  primaryTransportButton: { backgroundColor: '#007AFF' },
  disabledTransportButton: { opacity: 0.4 },
  transportText: { color: '#202124', fontWeight: '600' },
  primaryTransportText: { color: '#fff', fontWeight: '700' },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slider: { flex: 1, marginHorizontal: 10 },
  timeText: { fontSize: 12, color: '#555' },
  errorText: { color: '#b42318', textAlign: 'center', marginBottom: 12 },
});
