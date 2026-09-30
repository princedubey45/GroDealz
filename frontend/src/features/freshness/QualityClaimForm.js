import React, { useState } from 'react';

export default function QualityClaimForm({ orderId, productId, onSubmit }) {
  const [issue, setIssue] = useState('');
  const [photo, setPhoto] = useState(null);

  const issues = ['Spoiled', 'Damaged', 'Bruised', 'Overripe', 'Underripe', 'Wilted', 'Wrong Product'];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!issue) return alert('Please select an issue');
    onSubmit({ orderId, productId, issue, hasPhoto: !!photo });
  };

  return (
    <div style={{ background: 'var(--card)', padding: '20px', borderRadius: '12px', color: 'var(--text)', border: '1px solid var(--border)' }}>
      <h3 style={{ marginBottom: '16px' }}>Report a Quality Issue</h3>
      <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
        We guarantee freshness. Let us know what went wrong, and we'll make it right.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
        {issues.map(type => (
          <button
            key={type}
            onClick={() => setIssue(type)}
            style={{
              background: issue === type ? 'var(--accent)' : 'var(--card2)',
              color: issue === type ? '#000' : 'var(--text)',
              border: `1px solid ${issue === type ? 'var(--accent)' : 'var(--border)'}`,
              padding: '8px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {type}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px' }}>Attach Photo (Recommended for instant resolution)</label>
        <input 
          type="file" 
          accept="image/*" 
          onChange={(e) => setPhoto(e.target.files[0])}
          style={{ fontSize: '13px', color: 'var(--text2)' }}
        />
      </div>

      <button 
        onClick={handleSubmit}
        style={{
          width: '100%',
          padding: '12px',
          background: 'var(--accent)',
          color: '#000',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        Submit Claim
      </button>
    </div>
  );
}
