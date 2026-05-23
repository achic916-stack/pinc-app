import React from 'react';
import { View, Text } from 'react-native';
import './i18n'; // Essential for PincButton's useTranslation
import { PincButton } from './components/PincButton';

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: '#E0E9ED', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 20, color: '#5E5950', textAlign: 'center', margin: 20, padding: 20 }}>
        [Web Preview - App Level]
        {"\n\n"}
        แผนที่จะไม่แสดงบน Web Browser ครับ
        {"\n\n"}
        รบกวนคุณลูกค้า **กดปุ่ม + ด้านล่าง** 
        เพื่อดูหน้าต่างที่มีปุ่ม "Pinc Story" และ "ถาวร" ที่เราทำเสร็จไปแล้วได้เลยครับ!
      </Text>
      
      <PincButton 
        onPincSuccess={() => {}}
        currentUserId="test_user"
        venues={[]}
        userLocation={null}
        onPinCreated={() => {}}
        currentUser={{ userId: "test", username: "test", profile_pic: "", bio: "" }}
      />
    </View>
  );
}
