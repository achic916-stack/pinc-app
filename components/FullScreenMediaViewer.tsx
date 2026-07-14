import React from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { Image } from 'expo-image';
import { CachedVideo } from './CachedVideo';

interface FullScreenMediaViewerProps {
  visible: boolean;
  mediaUrl: string | null;
  mediaType: 'image' | 'video';
  onClose: () => void;
}

export const FullScreenMediaViewer: React.FC<FullScreenMediaViewerProps> = ({ 
  visible, 
  mediaUrl, 
  mediaType, 
  onClose 
}) => {
  if (!visible || !mediaUrl) return null;

  const isVideo = mediaType === 'video' || mediaUrl.includes('.mp4');

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={32} color="white" />
        </TouchableOpacity>
        
        <ReactNativeZoomableView
          maxZoom={5}
          minZoom={1}
          zoomStep={0.5}
          initialZoom={1}
          bindToBorders={true}
          style={styles.zoomContainer}
        >
          {isVideo ? (
             <CachedVideo
               source={{ uri: mediaUrl }}
               style={styles.media}
               resizeMode="contain"
               useNativeControls
               shouldPlay
               isLooping
             />
          ) : (
             <Image
               source={{ uri: mediaUrl }}
               style={styles.media}
               contentFit="contain"
             />
          )}
        </ReactNativeZoomableView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  zoomContainer: {
    flex: 1,
    width: '100%',
  },
  media: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  }
});
