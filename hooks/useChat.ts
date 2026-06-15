import { useEffect, useState, useRef } from 'react'
import {
  collection, addDoc, onSnapshot, orderBy,
  query, serverTimestamp, updateDoc, doc, where, getDocs,
  type Firestore,
} from 'firebase/firestore'
import type { UserRole } from '../types/document'

export type ChatMessage = {
  id: string
  text: string
  from: UserRole
  timestamp: Date
  readByAccountant: boolean
  readByCompany: boolean
}

export const useChat = (
  db: Firestore,
  companyId: string,
  myRole: UserRole,
  enabled = true,
) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading]   = useState(true)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!companyId || !enabled) { setLoading(false); return }

    const q = query(
      collection(db, 'companies', companyId, 'messages'),
      orderBy('timestamp', 'asc'),
    )

    unsubRef.current = onSnapshot(q,
      snap => {
        setMessages(snap.docs.map(d => ({
          id:               d.id,
          text:             d.data().text,
          from:             d.data().from,
          timestamp:        d.data().timestamp?.toDate() ?? new Date(),
          readByAccountant: d.data().readByAccountant ?? false,
          readByCompany:    d.data().readByCompany ?? false,
        })))
        setLoading(false)
      },
      err => {
        console.error('[useChat] Firestore error:', err.message)
        setLoading(false)
      },
    )

    return () => unsubRef.current?.()
  }, [companyId, enabled])

  const sendMessage = async (text: string) => {
    if (!text.trim() || !companyId) return
    await addDoc(collection(db, 'companies', companyId, 'messages'), {
      text:             text.trim(),
      from:             myRole,
      timestamp:        serverTimestamp(),
      readByAccountant: myRole === 'accountant',
      readByCompany:    myRole === 'company',
    })
  }

  const markAllAsRead = async () => {
    const readField = myRole === 'company' ? 'readByCompany' : 'readByAccountant'
    const unread = messages.filter(m => m.from !== myRole && !m[readField as keyof ChatMessage])
    for (const msg of unread) {
      await updateDoc(doc(db, 'companies', companyId, 'messages', msg.id), { [readField]: true })
    }
  }

  const unreadCount = async () => {
    const readField = myRole === 'company' ? 'readByCompany' : 'readByAccountant'
    const q = query(
      collection(db, 'companies', companyId, 'messages'),
      where('from', '!=', myRole),
      where(readField, '==', false),
    )
    const snap = await getDocs(q)
    return snap.size
  }

  return { messages, loading, sendMessage, markAllAsRead, unreadCount }
}
