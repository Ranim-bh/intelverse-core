# Modern Chatbot UI

A beautiful, responsive chatbot interface built with React, featuring functional components with hooks and smooth animations.

## 🎯 Features

### Core Features
- **Floating Chat Button** - A stylish button at the bottom right of the screen that opens/closes the chat
- **Modern Chat Window** - Clean, rounded interface with smooth open/close animations
- **Message Bubbles** - User messages appear on the right, bot messages on the left with distinct styling
- **Auto-scrolling** - Messages automatically scroll to the latest one
- **Typing Indicator** - Animated dots showing when the bot is composing a response

### User Interactions
- **Send Messages** - Type and send messages via button or Enter key
- **Smooth Animations** - Beautiful transitions for opening, closing, and message animations
- **Responsive Design** - Works perfectly on desktop, tablet, and mobile devices
- **Simulated Bot Responses** - Bot replies with random responses after 1 second

### Design Elements
- **Gradient Colors** - Purple-to-pink gradient for the button and header
- **Custom Scrollbar** - Styled scrollbar for the messages area
- **Shadow Effects** - Professional box shadows for depth
- **Message Timestamps** - Each message includes a timestamp (ready to display)

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173/`

## 📁 Project Structure

```
src/
├── components/
│   ├── Chatbot.jsx       # Main chatbot component
│   └── Chatbot.css       # Chatbot styling
├── App.jsx               # Main app component
├── App.css               # App styling
├── index.css             # Global styles
└── main.jsx              # Entry point
```

## 🎨 Component Details

### Chatbot Component
The main chatbot component (`src/components/Chatbot.jsx`) includes:

- **State Management**
  - `isOpen` - Controls whether the chat window is visible
  - `messages` - Array of message objects
  - `inputValue` - Current text in the input field
  - `isTyping` - Shows typing indicator

- **Key Functions**
  - `handleSendMessage()` - Processes user input and adds messages
  - `handleKeyPress()` - Allows Enter key to send messages
  - `scrollToBottom()` - Auto-scrolls to latest message

- **Features**
  - Messages auto-scroll with `useRef` and `useEffect`
  - Simulated 1-second bot response delay
  - Random bot responses for variety
  - Keyboard support (Enter to send)

## 🎭 Styling

### Colors
- **Primary Gradient**: `#667eea` to `#764ba2` (purple)
- **User Messages**: Gradient background, white text
- **Bot Messages**: Light gray background, dark text
- **Background**: Gradient from light blue to light purple

### Responsive Breakpoints
- **Desktop**: 400px wide chat window
- **Tablet**: 380px wide chat window
- **Mobile**: Full width minus padding

### Animations
- **Slide In**: Messages slide in smoothly
- **Typing Indicator**: Three dots bounce animation
- **Window Open/Close**: Scale and opacity transitions
- **Button Hover**: Scale and shadow effects

## 📝 Usage

1. **Click the floating button** (bottom right) to open the chat
2. **Type your message** in the input field
3. **Press Enter or click Send** to send your message
4. **Wait for the bot response** (simulated after 1 second)
5. **Click the X button** to close the chat window

## 🔧 Building for Production

```bash
npm run build
```

This creates an optimized production build in the `dist/` directory.

## 📦 Dependencies

- **React** - UI library
- **Vite** - Build tool and dev server
- **React DOM** - React rendering

### Dev Dependencies
- **Tailwind CSS** (installed, optional for future use)
- **PostCSS** (for Tailwind support)
- **Autoprefixer** (for CSS vendor prefixes)

## 🎓 Key React Concepts Used

- **Functional Components** - All components are functional, not class-based
- **Hooks**
  - `useState` - For state management
  - `useRef` - For DOM references (auto-scroll)
  - `useEffect` - For side effects and auto-scroll
- **Event Handling** - Form submission and keyboard events
- **Conditional Rendering** - Show/hide messages and typing indicator
- **Array Methods** - map() for rendering message lists

## 🌟 Bonus Features Implemented

✅ **Auto-scroll to Latest Message** - Uses `useRef` and `scrollIntoView`
✅ **Enter Key to Send** - Implemented with `onKeyPress` event handler
✅ **Typing Indicator** - Shows animated dots while bot is "thinking"
✅ **Smooth Animations** - CSS transitions and keyframe animations
✅ **Responsive Design** - Mobile-friendly with media queries

## 🚀 Future Enhancements

Potential improvements for the chatbot:
- Connect to a real API or AI service (OpenAI, etc.)
- Add message history persistence (localStorage)
- Implement user authentication
- Add emoji support and reactions
- Sound notifications for new messages
- Markdown support in messages
- Message settings (font size, theme selection)
- Conversation history/previous chats
- A/B testing for different UI variations

## 📄 License

This project is open source and available under the MIT License.

## 💡 Tips

- The chat window height is 500px on desktop and adjusts on mobile
- Message bubbles have a max-width of 70% to match typical chat apps
- The bot responses are randomized - add your own responses in the responder array
- Custom CSS is used for full control over styling without Tailwind dependencies

---

Built with ❤️ using React and modern web technologies.
