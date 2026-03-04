export default function QuickBtn({ label, onClick, primary }) {
  return (
    <button className={`quick-btn${primary ? ' primary' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}
