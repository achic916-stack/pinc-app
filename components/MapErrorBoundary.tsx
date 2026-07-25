import React from 'react';
import { View, Text, SafeAreaView, StyleSheet, TouchableOpacity } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class MapErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("MapErrorBoundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>🚨 Map Render Error Caught</Text>
            <Text style={styles.subtitle}>
              The map screen encountered a JavaScript error during rendering:
            </Text>
            <Text style={styles.errorText}>
              {this.state.error?.toString() || "Unknown error"}
            </Text>
            {this.state.errorInfo?.componentStack && (
              <Text style={styles.stackText} numberOfLines={10}>
                {this.state.errorInfo.componentStack}
              </Text>
            )}
            <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
              <Text style={styles.buttonText}>Try Reloading Map</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14141e',
    justify: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1c1c28',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    borderColor: '#FF3B30',
    borderWidth: 1.5,
  },
  title: {
    color: '#FF3B30',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#CCCCCC',
    fontSize: 13,
    marginBottom: 12,
  },
  errorText: {
    color: '#FF9500',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  stackText: {
    color: '#888888',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
