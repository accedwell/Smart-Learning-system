import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/prototype.css'
import { I18nProvider } from './i18n/I18nContext.jsx'
import { StoreProvider } from './store/AppStore.jsx'
import App from './App.jsx'
import EmbeddedClassroom, { embeddedClassroomId } from './live/EmbeddedClassroom.jsx'

// the mobile app shows just the live classroom of one online class
const classroomId = embeddedClassroomId();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <StoreProvider>
        {classroomId ? <EmbeddedClassroom id={classroomId}/> : <App />}
      </StoreProvider>
    </I18nProvider>
  </StrictMode>,
)
