import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppBootGate } from './app/AppBootGate';
import { AppProvidersNext } from './app/AppProvidersNext';
// 显式引一次：i18n 必须在任何 `useTranslation()` 渲染前就绪（模块加载即初始化）。
import './core/i18n';

document.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement) && !target?.isContentEditable) event.preventDefault();
});
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(import.meta.env.PROD ? <React.StrictMode><AppProvidersNext><AppBootGate /></AppProvidersNext></React.StrictMode> : <AppProvidersNext><AppBootGate /></AppProvidersNext>);
