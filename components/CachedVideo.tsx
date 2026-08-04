import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';
import { PincTheme } from "../styles/theme";

interface CachedVideoProps {
  source: { uri: string } | null;
  style?: any;
  resizeMode?: "cover" | "contain" | "stretch";
  shouldPlay?: boolean;
  isLooping?: boolean;
  useNativeControls?: boolean;
  isMuted?: boolean;
}

export const CachedVideo: React.FC<CachedVideoProps> = ({ source, ...props }) => {
  const videoUri = source?.uri || "";
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<Video>(null);
  const webviewRef = useRef<WebView>(null);

  useEffect(() => {
    setHasError(false);
  }, [videoUri]);

  // Cleanup native decoder resources on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  // Sync shouldPlay for native Video ref
  useEffect(() => {
    if (videoRef.current && !hasError) {
      if (props.shouldPlay !== false) {
        videoRef.current.playAsync().catch(() => {});
      } else {
        videoRef.current.pauseAsync().catch(() => {});
      }
    }
  }, [props.shouldPlay, hasError]);

  if (!videoUri) {
    return (
      <View style={[styles.loadingContainer, props.style]}>
        <ActivityIndicator size="large" color="#E4007F" />
      </View>
    );
  }

  // Primary Player: Native expo-av Video (ExoPlayer on Android / AVPlayer on iOS)
  if (!hasError) {
    return (
      <View style={[styles.container, props.style]}>
        <Video
          ref={videoRef}
          source={{ uri: videoUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode={props.resizeMode === 'cover' ? ResizeMode.COVER : ResizeMode.CONTAIN}
          shouldPlay={props.shouldPlay !== false}
          isLooping={props.isLooping !== false}
          isMuted={props.isMuted}
          useNativeControls={props.useNativeControls}
          onError={(err) => {
            console.warn("Native Video error, falling back to WebView:", err);
            setHasError(true);
          }}
        />
      </View>
    );
  }

  // Fallback Player: HTML5 WebView with autoplay retry
  const objectFit = (props.resizeMode === "cover") ? "cover" : "contain";
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        body { margin: 0; padding: 0; background-color: black; overflow: hidden; display: flex; justify-content: center; align-items: center; width: 100vw; height: 100vh; }
        video { width: 100%; height: 100%; object-fit: ${objectFit}; outline: none; }
      </style>
    </head>
    <body>
      <video 
        id="main-video"
        src="${videoUri}" 
        ${props.shouldPlay !== false ? "autoplay" : ""} 
        ${props.isLooping !== false ? "loop" : ""} 
        ${props.useNativeControls ? "controls" : ""} 
        preload="auto"
        playsinline 
        webkit-playsinline
      ></video>
      <script>
        const v = document.getElementById('main-video');
        window.videoElement = v;
        function tryPlay() {
          if (v) {
            v.play().catch(function(e) {
              v.muted = true;
              v.play();
            });
          }
        }
        document.addEventListener('DOMContentLoaded', tryPlay);
        setTimeout(tryPlay, 300);
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.container, props.style]}>
      <WebView
        ref={webviewRef}
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        originWhitelist={['*']}
        mixedContentMode="always"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  webview: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    opacity: 0.99,
  },
  loadingContainer: {
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
