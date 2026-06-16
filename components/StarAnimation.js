import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';

const frames = [
  require('../Assets/Animations/star1.png'),
  require('../Assets/Animations/star2.png'),
  require('../Assets/Animations/star3.png'),
];

export default function StarAnimation() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, 600);

    return () => clearInterval(interval);
  }, []);

  return (
    <Image
      source={frames[frame]}
      style={{
        width: 320,
        height: 320,
        alignSelf: 'center',
        resizeMode: 'contain',
      }}
    />
  );
}
