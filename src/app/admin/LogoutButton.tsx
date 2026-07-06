'use client'

export default function LogoutButton() {
  async function logout() {
    await fetch('/api/admin/login', { method: 'DELETE' })
    window.location.href = '/admin/login'
  }
  return (
    <button onClick={logout} className="text-white/70 hover:text-white">
      Log out
    </button>
  )
}
