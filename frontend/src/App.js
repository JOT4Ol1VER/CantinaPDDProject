import React from 'react';

function App() {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh', 
      backgroundColor: '#f0f0f0',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ 
        padding: '40px', 
        backgroundColor: 'white', 
        borderRadius: '10px', 
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h1 style={{ color: '#333' }}>Teste de Build</h1>
        <p style={{ color: '#555', fontSize: '18px' }}>Se você está vendo isso, o build da Vercel funcionou.</p>
      </div>
    </div>
  );
}

export default App;
