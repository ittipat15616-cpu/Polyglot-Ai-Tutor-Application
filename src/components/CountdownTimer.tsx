import React, { useState, useEffect } from 'react';

export default function CountdownTimer({ expiresAt, onExpire }: { expiresAt: number; onExpire?: () => void }) {
  const [timeLeft, setTimeLeft] = useState(expiresAt - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
        if (onExpire) onExpire();
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  if (timeLeft <= 0) return <span>0:00:00:00</span>;

  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  const format = (n: number) => String(n).padStart(2, '0');

  return <span>{days}:{format(hours)}:{format(minutes)}:{format(seconds)}</span>;
}
