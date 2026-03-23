import { useState, useEffect, useRef } from 'react';

export function useCountUp(end: number, duration: number = 1000, decimals: number = 0) {
  const [count, setCount] = useState(0);
  const prevEnd = useRef(end);

  useEffect(() => {
    prevEnd.current = end;
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(parseFloat((eased * end).toFixed(decimals)));
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, duration, decimals]);

  return count;
}
