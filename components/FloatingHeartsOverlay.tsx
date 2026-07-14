import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Animated, StyleSheet, Easing, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PincTheme } from '../styles/theme';

const { height: windowHeight, width: windowWidth } = Dimensions.get('window');

interface FloatingHeartsOverlayProps {}

export interface FloatingHeartsRef {
  triggerAnimation: () => void;
}

interface Particle {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
}

interface HeartAnim {
  id: number;
  translateY: Animated.Value;
  translateX: Animated.Value;
  mainOpacity: Animated.Value;
  scale: Animated.Value;
  burstParticles: Particle[];
}

export const FloatingHeartsOverlay = forwardRef<FloatingHeartsRef, FloatingHeartsOverlayProps>((props, ref) => {
  const [hearts, setHearts] = useState<HeartAnim[]>([]);
  const heartIdCounter = useRef(0);

  useImperativeHandle(ref, () => ({
    triggerAnimation: () => {
      const id = heartIdCounter.current++;
      
      // Create initial heart and its burst particles
      const newHeart: HeartAnim = {
        id,
        translateY: new Animated.Value(0),
        translateX: new Animated.Value(0),
        mainOpacity: new Animated.Value(1),
        scale: new Animated.Value(0.5), // Start small and pop in
        burstParticles: Array.from({ length: 8 }).map((_, i) => ({
          id: i,
          x: new Animated.Value(0),
          y: new Animated.Value(0),
          opacity: new Animated.Value(0),
          scale: new Animated.Value(0.2),
        }))
      };

      setHearts(prev => [...prev, newHeart]);

      // Phase 1: Pop in, float up and sway
      const floatDuration = 1200;
      const swayAmount = 40 + Math.random() * 40;
      const direction = Math.random() > 0.5 ? 1 : -1;
      
      Animated.parallel([
        Animated.spring(newHeart.scale, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(newHeart.translateY, {
          toValue: -windowHeight * 0.45, // Float up near the top
          duration: floatDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(newHeart.translateX, {
            toValue: swayAmount * direction,
            duration: floatDuration / 2,
            easing: Easing.sin,
            useNativeDriver: true,
          }),
          Animated.timing(newHeart.translateX, {
            toValue: 0,
            duration: floatDuration / 2,
            easing: Easing.sin,
            useNativeDriver: true,
          })
        ])
      ]).start(() => {
        // Phase 2: Burst and fade!
        newHeart.mainOpacity.setValue(0); // Hide the main heart
        
        const burstAnims = newHeart.burstParticles.map((p, i) => {
          // Calculate random outward explosion in a circle
          const angle = (Math.PI * 2 * i) / 8 + (Math.random() * 0.2);
          const distance = 50 + Math.random() * 50;
          p.opacity.setValue(1); // Show particle
          p.scale.setValue(1);
          
          return Animated.parallel([
            Animated.timing(p.x, {
              toValue: Math.cos(angle) * distance,
              duration: 800,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(p.y, {
              toValue: Math.sin(angle) * distance,
              duration: 800,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(p.scale, {
              toValue: 1.5,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(p.opacity, {
              toValue: 0, // Fade out like a mist
              duration: 800,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            })
          ]);
        });

        Animated.parallel(burstAnims).start(() => {
          // Remove heart from state after burst completes
          setHearts(prev => prev.filter(h => h.id !== id));
        });
      });
    }
  }));

  if (hearts.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {hearts.map(heart => (
        <Animated.View
          key={heart.id}
          style={[
            styles.heartContainer,
            {
              transform: [
                { translateY: heart.translateY },
                { translateX: heart.translateX },
              ]
            }
          ]}
        >
          {/* Main Heart */}
          <Animated.View style={{ opacity: heart.mainOpacity, transform: [{ scale: heart.scale }] }}>
            <Ionicons name="heart" size={60} color={PincTheme.colors.primary} style={styles.shadow} />
          </Animated.View>
          
          {/* Burst Particles */}
          {heart.burstParticles.map(p => (
            <Animated.View
              key={`burst-${p.id}`}
              style={[
                styles.particle,
                {
                  opacity: p.opacity,
                  transform: [
                    { translateX: p.x },
                    { translateY: p.y },
                    { scale: p.scale }
                  ]
                }
              ]}
            >
              <Ionicons name="heart" size={20} color={PincTheme.colors.primary} style={styles.shadow} />
            </Animated.View>
          ))}
        </Animated.View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  heartContainer: {
    position: 'absolute',
    bottom: '25%', 
    left: windowWidth / 2 - 30, // Center horizontally
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
  shadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  }
});
