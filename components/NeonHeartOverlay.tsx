import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PincTheme } from '../styles/theme';

interface NeonHeartOverlayProps {}

export interface NeonHeartRef {
  triggerAnimation: (x: number, y: number) => void;
}

interface HeartAnim {
  id: number;
  x: number;
  y: number;
  scale: Animated.Value;
  outlineOpacity: Animated.Value;
  filledOpacity: Animated.Value;
}

export const NeonHeartOverlay = forwardRef<NeonHeartRef, NeonHeartOverlayProps>((props, ref) => {
  const [hearts, setHearts] = useState<HeartAnim[]>([]);
  const heartIdCounter = useRef(0);

  useImperativeHandle(ref, () => ({
    triggerAnimation: (x: number, y: number) => {
      const id = heartIdCounter.current++;
      
      const newHeart: HeartAnim = {
        id,
        x,
        y,
        scale: new Animated.Value(1.2), // Starts slightly larger
        outlineOpacity: new Animated.Value(1),
        filledOpacity: new Animated.Value(0),
      };

      setHearts(prev => [...prev, newHeart]);

      // Snappy animation sequence
      Animated.sequence([
        // Step 1: Shrink outline and fade in filled heart rapidly
        Animated.parallel([
          Animated.timing(newHeart.scale, {
            toValue: 0.9,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(newHeart.filledOpacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          })
        ]),
        // Step 2: Hold for a fraction of a second
        Animated.delay(100),
        // Step 3: Instantly vanish
        Animated.parallel([
          Animated.timing(newHeart.outlineOpacity, {
            toValue: 0,
            duration: 50, // almost instant
            useNativeDriver: true,
          }),
          Animated.timing(newHeart.filledOpacity, {
            toValue: 0,
            duration: 50,
            useNativeDriver: true,
          })
        ])
      ]).start(() => {
        // Remove from state
        setHearts(prev => prev.filter(h => h.id !== id));
      });
    }
  }));

  if (hearts.length === 0) return null;

  const HEART_SIZE = 80; // Larger than thumb
  const OFFSET = HEART_SIZE / 2; // to center at tap location

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {hearts.map(heart => (
        <View
          key={heart.id}
          style={[
            styles.heartContainer,
            {
              left: heart.x - OFFSET,
              top: heart.y - OFFSET,
            }
          ]}
        >
          {/* Outline Heart */}
          <Animated.View style={{ position: 'absolute', opacity: heart.outlineOpacity, transform: [{ scale: heart.scale }] }}>
            <Ionicons name="heart-outline" size={HEART_SIZE} color={PincTheme.colors.primary} style={styles.neonGlow} />
          </Animated.View>

          {/* Filled Heart */}
          <Animated.View style={{ position: 'absolute', opacity: heart.filledOpacity, transform: [{ scale: heart.scale }] }}>
            <Ionicons name="heart" size={HEART_SIZE} color={PincTheme.colors.primary} style={styles.neonGlow} />
          </Animated.View>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  heartContainer: {
    position: 'absolute',
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neonGlow: {
    textShadowColor: '#FF2D55',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  }
});
