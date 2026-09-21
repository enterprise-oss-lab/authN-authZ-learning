import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { User } from 'oidc-client-ts';

import { getCurrentUser, userManager } from './auth';

type DocumentSummary = { id: string; title: string; updatedAt: string };
type Document = DocumentSummary & { body: string; createdAt: string };

function DocumentWorkspace({ user }: { user: User }) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selected, setSelected] = useState<Document | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [shareUserId, setShareUserId] = useState('');
  const [shareRole, setShareRole] = useState<'viewer' | 'editor'>('viewer');
  const [message, setMessage] = useState('');

  const api = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${user.access_token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  };

  const loadDocuments = async () => {
    try {
      const response = await api<{ documents: DocumentSummary[] }>('/documents');
      setDocuments(response.documents);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '文書一覧を取得できませんでした。');
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, []);

  const selectDocument = async (documentId: string) => {
    try {
      const response = await api<{ document: Document }>(`/documents/${documentId}`);
      setSelected(response.document);
      setTitle(response.document.title);
      setBody(response.document.body);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '文書を取得できませんでした。');
    }
  };

  const createDocument = async () => {
    try {
      const response = await api<{ document: Document }>('/documents', {
        method: 'POST',
        body: JSON.stringify({ title: title || 'Untitled document', body }),
      });
      setSelected(response.document);
      setTitle(response.document.title);
      setBody(response.document.body);
      await loadDocuments();
      setMessage('文書を作成し、あなたを owner として登録しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '文書を作成できませんでした。');
    }
  };

  const saveDocument = async () => {
    if (!selected) return;
    try {
      const response = await api<{ document: Document }>(`/documents/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, body }),
      });
      setSelected(response.document);
      await loadDocuments();
      setMessage('保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '編集権限がありません。');
    }
  };

  const shareDocument = async () => {
    if (!selected || !shareUserId) return;
    try {
      await api<void>(`/documents/${selected.id}/shares`, {
        method: 'POST',
        body: JSON.stringify({ userId: shareUserId, role: shareRole }),
      });
      setMessage(`${shareUserId} に ${shareRole} 権限を付与しました。`);
      setShareUserId('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '共有権限がありません。');
    }
  };

  return (
    <section>
      <h2>Documents</h2>
      <button onClick={() => { setSelected(null); setTitle(''); setBody(''); }}>新規文書</button>
      <ul>
        {documents.map((document) => (
          <li key={document.id}>
            <button onClick={() => void selectDocument(document.id)}>{document.title}</button>
          </li>
        ))}
      </ul>
      <label>
        タイトル
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        本文
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={8} />
      </label>
      <button onClick={() => void (selected ? saveDocument() : createDocument())}>
        {selected ? '保存' : '作成'}
      </button>
      {selected && (
        <section>
          <h3>共有</h3>
          <input
            placeholder="共有先の Zitadel user ID (sub)"
            value={shareUserId}
            onChange={(event) => setShareUserId(event.target.value)}
          />
          <select value={shareRole} onChange={(event) => setShareRole(event.target.value as 'viewer' | 'editor')}>
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
          </select>
          <button onClick={() => void shareDocument()}>共有する</button>
        </section>
      )}
      <p>{message}</p>
    </section>
  );
}

function App() {
  const [subject, setSubject] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const verifyApiAccess = async (user: User) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/me`, {
      headers: { authorization: `Bearer ${user.access_token}` },
    });

    if (!response.ok) {
      setApiResult(`API verification failed: ${response.status}`);
      return;
    }

    const body = (await response.json()) as { sub: string };
    setApiResult(`API verified token for: ${body.sub}`);
  };

  useEffect(() => {
    if (window.location.pathname === '/auth/callback') {
      void userManager.signinRedirectCallback().then((user) => {
        window.history.replaceState({}, document.title, '/');
        setSubject(user.profile.sub);
        setUser(user);
        void verifyApiAccess(user);
      });
      return;
    }

    void getCurrentUser().then((user) => {
      setSubject(user?.profile.sub ?? null);
      setUser(user);
      if (user) {
        void verifyApiAccess(user);
      }
    });
  }, []);

  if (!subject) {
    return (
      <main>
        <h1>AuthN / AuthZ Learning</h1>
        <button onClick={() => void userManager.signinRedirect()}>Zitadel でログイン</button>
      </main>
    );
  }

  return (
    <main>
      <h1>AuthN / AuthZ Learning</h1>
      <p>ログイン済み: {subject}</p>
      <p>{apiResult ?? 'API トークン検証中...'}</p>
      {user && <DocumentWorkspace user={user} />}
      <button onClick={() => void userManager.signoutRedirect()}>ログアウト</button>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
