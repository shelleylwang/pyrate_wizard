import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PyRateWizard from '../pyrate_wizard.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PyRateWizard />
  </StrictMode>
)
