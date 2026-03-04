import React from 'react';

/**
 * A quick-action button shown below the chat.
 * Used for common actions like "Checkout", "Add more", etc.
 */
export default function QuickBtn({ label, onClick }) {
  return (
    <button className="quick-btn" onClick={onClick}>
      {label}
    </button>
  );
}
