import './MessageBubble.css'

export default function MessageBubble({ message, sender }) {
  return (
    <div className={`message-wrapper ${sender}`}>
      <div className={`message-bubble ${sender}`}>
        {message}
      </div>
    </div>
  )
}
