import React, { useState, useEffect } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [shareUrl, setShareUrl] = useState('');
  const [viewPdfUrl, setViewPdfUrl] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('pdf');
    if (url) {
      setViewPdfUrl(url);
    }
  },[]);

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    // ファイル名の重複防止
    const uniqueFileName = `${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `pdfs/${uniqueFileName}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const currentProgress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setProgress(currentProgress);
      },
      (error) => {
        console.error('アップロードエラー:', error);
        alert('アップロードに失敗しました。');
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        
        // 共有用URLの生成
        const currentAppUrl = window.location.origin + window.location.pathname;
        const generatedShareUrl = `${currentAppUrl}?pdf=${encodeURIComponent(downloadURL)}`;
        
        setShareUrl(generatedShareUrl);
      }
    );
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    alert('URLをコピーしました。');
  };

  if (viewPdfUrl) {
    return (
      <div className="viewer-container">
        <header className="header">
          <h2>PDF Viewer</h2>
          <button onClick={() => window.location.href = window.location.origin + window.location.pathname}>
            新しくアップロードする
          </button>
        </header>
        <iframe
          src={viewPdfUrl}
          width="100%"
          height="80vh"
          title="PDF Viewer"
          style={{ border: '1px solid #ccc', borderRadius: '8px', minHeight: '80vh' }}
        ></iframe>
      </div>
    );
  }

  return (
    <div className="upload-container">
      <h1>PDF Linker</h1>
      <p>PDFをアップロードして、URLを共有しよう。</p>
      
      <div className="upload-box">
        <input type="file" accept="application/pdf" onChange={handleFileChange} />
        <button onClick={handleUpload} disabled={!file || (progress > 0 && progress < 100)}>
          アップロード
        </button>
      </div>

      {progress > 0 && progress < 100 && (
        <p>アップロード中... {progress}%</p>
      )}

      {shareUrl && (
        <div className="share-box">
          <h3>アップロード完了</h3>
          <div className="share-input-group">
            <input type="text" value={shareUrl} readOnly />
            <button onClick={handleCopy}>コピー</button>
          </div>
          <button 
            className="view-btn" 
            onClick={() => window.location.href = shareUrl}
          >
            閲覧
          </button>
        </div>
      )}
    </div>
  );
}

export default App;