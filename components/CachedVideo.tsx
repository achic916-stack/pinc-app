import React, { useRef, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

interface CachedVideoProps {
  source: { uri: string } | null;
  style?: any;
  resizeMode?: "cover" | "contain" | "stretch";
  shouldPlay?: boolean;
  isLooping?: boolean;
  useNativeControls?: boolean;
}

export const CachedVideo: React.FC<CachedVideoProps> = ({ source, ...props }) => {
  const videoUri = source?.uri || "";
  const webviewRef = useRef<WebView>(null);

  // Sync shouldPlay dynamically
  useEffect(() => {
    if (webviewRef.current) {
      if (props.shouldPlay) {
        webviewRef.current.injectJavaScript(`
          if (window.videoElement) {
            window.videoElement.play().catch(e => console.log(e));
          }
          true;
        `);
      } else {
        webviewRef.current.injectJavaScript(`
          if (window.videoElement) {
            window.videoElement.pause();
          }
          true;
        `);
      }
    }
  }, [props.shouldPlay]);

  if (!videoUri) {
    return (
      <View style={[styles.loadingContainer, props.style]}>
        <ActivityIndicator size="large" color="#E4007F" />
      </View>
    );
  }

  // Generate HTML for the WebView
  const objectFit = (props.resizeMode === "cover") ? "cover" : "contain";
  
  // Using WebView completely avoids the native ExoPlayer crashes by offloading video decoding
  // to the Chromium engine, which has much broader codec support and software fallbacks.
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
        ${props.shouldPlay ? "autoplay" : ""} 
        ${props.isLooping ? "loop" : ""} 
        ${props.useNativeControls ? "controls" : ""} 
        playsinline 
        webkit-playsinline
      ></video>
      <script>
        window.videoElement = document.getElementById('main-video');
        // Prevent default tap highlight
        document.addEventListener("touchstart", function() {},false);
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
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'black',
  },
  webview: {
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
    opacity: 0.99, // Fix for some Android rendering glitches
  },
  loadingContainer: {
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
