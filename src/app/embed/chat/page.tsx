import { notFound } from 'next/navigation'
import AgentChat from '../../AgentChat'

// The chat bubble on its own, for the /chat.js iframe on the main website. The
// page is transparent so only the bubble shows over the host page. Off with
// the agent: /chat.js shows the MyChatBot widget then and never loads this.
export default function EmbeddedChat() {
  const agentChat =
    process.env.DOME_AGENT_WIDGET === 'on' && process.env.DOME_AGENT === 'on' && Boolean(process.env.ANTHROPIC_API_KEY)
  if (!agentChat) notFound()
  return (
    <>
      <style
        precedence="default"
        href="dome-embed-chat"
        dangerouslySetInnerHTML={{ __html: 'html,body{background:transparent!important;color-scheme:normal}' }}
      />
      <AgentChat embedded />
    </>
  )
}
