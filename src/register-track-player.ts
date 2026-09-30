import TrackPlayer from '@rntp/player';
import { playbackService } from './playback-service';

TrackPlayer.registerPlaybackSession(playbackService);
