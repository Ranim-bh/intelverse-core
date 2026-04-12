import { useState, useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble'
import './Chatbot.css'

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: 'Bonjour 👋 comment puis-je vous aider ?',
      sender: 'bot',
    },
  ])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!inputValue.trim()) return

    const newMessage = {
      id: Date.now(),
      text: inputValue,
      sender: 'user',
    }

    setMessages((prev) => [...prev, newMessage])
    setInputValue('')
    setIsTyping(true)

    setTimeout(() => {
      const botResponses = [
        'C\'est une bonne question! Laissez-moi vous aider.',
        'Je comprends. Pouvez-vous me donner plus de détails?',
        'Intéressant! Parlez-moi davantage de vos besoins.',
        'Je suis là pour vous aider. Comment puis-je continuer?',
        'C\'est noté. Y a-t-il autre chose?',
        'Merci pour votre message. Comment puis-je vous assister?',
      ]
      const randomResponse = botResponses[Math.floor(Math.random() * botResponses.length)]
      const botMessage = {
        id: Date.now() + 1,
        text: randomResponse,
        sender: 'bot',
      }
      setMessages((prev) => [...prev, botMessage])
      setIsTyping(false)
    }, 1000)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
    }
  }

  return (
    <div className="chatbot-fixed-wrapper">
      <button
        className={`chatbot-toggle-btn ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Fermer le chat' : 'Ouvrir le chat'}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M8 10h8M8 14h5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div className={`chatbot-window ${isOpen ? 'visible' : ''}`}>
        <div className="chatbot-header">
          <h2>TalentVerse Assistant</h2>
        </div>

        <div className="chatbot-messages">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message.text} sender={message.sender} />
          ))}

          {isTyping && (
            <div className="message-wrapper bot">
              <div className="message-bubble bot typing">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="chatbot-input-container">
          <input
            type="text"
            placeholder="Tapez votre message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            className="chatbot-input"
          />
          <button type="submit" className="chatbot-send-btn" aria-label="Envoyer">
            Envoyer
          </button>
        </form>
      </div>
    </div>
  )
}

