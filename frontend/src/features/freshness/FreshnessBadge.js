import React from 'react';

export default function FreshnessBadge({ status, reason }) {
  let bgColor, color, icon;

  switch (status) {
    case 'Very Fresh':
      bgColor = 'rgba(16,185,129,0.15)';
      color = '#10b981';
      icon = '🥬';
      break;
    case 'Fresh':
      bgColor = 'rgba(59,130,246,0.15)';
      color = '#3b82f6';
      icon = '🍏';
      break;
    case 'Use Soon':
      bgColor = 'rgba(245,158,11,0.15)';
      color = '#f59e0b';
      icon = '⏳';
      break;
    case 'Quality Concern':
      bgColor = 'rgba(239,68,68,0.15)';
      color = '#ef4444';
      icon = '⚠️';
      break;
    default:
      bgColor = 'var(--card2)';
      color = 'var(--text)';
      icon = '📦';
  }

  return (
    <div title={reason} style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: bgColor,
      color: color,
      padding: '4px 10px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: 'bold',
      border: `1px solid ${color}`,
      cursor: 'help'
    }}>
      <span>{icon}</span>
      <span>{status}</span>
    </div>
  );
}
