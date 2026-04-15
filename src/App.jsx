import React, { useState, useEffect } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, listAll } from 'firebase/storage';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { storage, auth, provider } from './firebase';
import { PDFDocument } from 'pdf-lib';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const[file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const[shareUrl, setShareUrl] = useState('');
  const [viewPdfUrl, setViewPdfUrl] = useState('');
  const [pdfList, setPdfList] = useState([]); // 過去のPDF一覧

  // URLチェックとログイン状態の監視
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('pdf');
    if (url) {
      setViewPdfUrl(url);
    }

    // ログイン状態の監視
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchPdfList(currentUser.uid);
      } else {
        setPdfList([]);
      }
    });
    return () => unsubscribe();
  },[]);

  const login = () => signInWithPopup(auth, provider);
  const logout = () => signOut(auth);

  // 過去にアップロードしたPDFの一覧を取得
  const fetchPdfList = async (uid) => {
    const listRef = ref(storage, `pdfs/${uid}`);
    try {
      const res = await listAll(listRef);
      // 新しい順にソート (ファイル名のタイムスタンプを利用)
      const sortedItems = res.items.sort((a, b) => b.name.localeCompare(a.name));
      
      const fileData = await Promise.all(sortedItems.map(async (item) => {
        const url = await getDownloadURL(item);
        const nameMatch = item.name.match(/^\d+_(.+)$/);
        const originalName = nameMatch ? nameMatch[1] : item.name;
        return { name: originalName, url: url };
      }));
      setPdfList(fileData);
    } catch (error) {
      console.error('一覧取得エラー:', error);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file || !user) return;
    let uploadFile = file;
    setIsCompressing(true);

    // 簡易圧縮処理
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
      if (pdfBytes.length < file.size) {
        uploadFile = new File([pdfBytes], file.name, { type: 'application/pdf' });
      }
    } catch (error) {
      console.error('圧縮エラー:', error);
    }
    setIsCompressing(false);

    if (uploadFile.size > 10 * 1024 * 1024) {
      alert('10MBを超えています。圧縮してサイドアップロードしてください');
      return;
    }

    // 保存先を「pdfs/ユーザーID/ファイル名」に変更
    const uniqueFileName = `${Date.now()}_${uploadFile.name}`;
    const storageRef = ref(storage, `pdfs/${user.uid}/${uniqueFileName}`);
    const uploadTask = uploadBytesResumable(storageRef, uploadFile);

    uploadTask.on(
      'state_changed',
      (snapshot) => setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      (error) => alert('アップロード失敗'),
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        const currentAppUrl = window.location.origin + window.location.pathname;
        setShareUrl(`${currentAppUrl}?pdf=${encodeURIComponent(downloadURL)}`);
        
        // アップロード後に一覧を再取得して更新
        fetchPdfList(user.uid);
        setProgress(0);
        setFile(null);
      }
    );
  };

  const copyToClipboard = async (url) => {
    await navigator.clipboard.writeText(url);
    alert('共有URLをコピーしました。');
  };

  if (viewPdfUrl) {
    return (
      <div className="viewer-fullscreen">
        <header className="viewer-header">
          <h2>📄 PDF Viewer</h2>
          <button onClick={() => window.location.href = window.location.origin + window.location.pathname}>
            アプリのトップに戻る
          </button>
        </header>
        <iframe src={viewPdfUrl} title="PDF Viewer" className="pdf-iframe"></iframe>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="main-header">
        <h1 color='#333'>PDF Linker</h1>
        {user ? (
          <div className="user-info">
            <img src={user.photoURL} alt="icon" className="user-icon" />
            <button className="logout-btn" onClick={logout}>ログアウト</button>
          </div>
        ) : (
          <button onClick={login} className="login-btn">Googleでログイン</button>
        )}
      </header>

      {user ? (
        <div className="dashboard">
          {/* アップロードエリア */}
          <div className="upload-section">
            <h2>新しいPDFをアップロード</h2>
            <div className="upload-box">
              <input type="file" accept="application/pdf" onChange={handleFileChange} />
              <button onClick={handleUpload} disabled={!file || (progress > 0 && progress < 100) || isCompressing}>
                {isCompressing ? '最適化中...' : 'アップロード'}
              </button>
            </div>
            {progress > 0 && progress < 100 && <p>アップロード中... {progress}%</p>}
            
            {shareUrl && (
              <div className="share-box">
                <p>アップロード成功</p>
                <button onClick={() => copyToClipboard(shareUrl)}>URLをコピー</button>
                <button className="view-btn" onClick={() => window.location.href = shareUrl}>閲覧する</button>
              </div>
            )}
          </div>

          {/* 過去のアップロード一覧エリア */}
          <div className="history-section">
            <h2>過去のアップロード</h2>
            {pdfList.length === 0 ? (
              <p className="no-data">まだアップロードしたPDFはありません。</p>
            ) : (
              <ul className="pdf-list">
                {pdfList.map((pdf, index) => {
                  const itemShareUrl = `${window.location.origin}${window.location.pathname}?pdf=${encodeURIComponent(pdf.url)}`;
                  return (
                    <li key={index} className="pdf-item">
                      <span className="pdf-name" onClick={() => window.location.href = itemShareUrl}>
                        ・ {pdf.name}
                      </span>
                      <button className="copy-small-btn" onClick={() => copyToClipboard(itemShareUrl)}>
                        URLコピー
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="welcome-screen">
          <p>PDFをアップロード・圧縮して、URLで簡単に共有できるツールです。</p>
          <p>利用するにはGoogleアカウントでログインしてください。</p>
        </div>
      )}
    </div>
  );
}

export default App;