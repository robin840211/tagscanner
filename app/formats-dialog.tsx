'use client';

import { useRef } from 'react';

export default function FormatsDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="link-button" onClick={() => dialog.current?.showModal()}>支援格式</button>
      <dialog ref={dialog} className="formats-dialog" aria-labelledby="formats-title" onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
        <div className="formats-content">
          <h2 id="formats-title">支援格式</h2>
          <section><h3>二維碼</h3><p>QR · Data Matrix · Aztec · PDF417</p></section>
          <section><h3>一維條碼</h3><p>EAN-8 / 13 · UPC-A / E · Code 39 / 93 / 128 · ITF · Codabar</p></section>
          <section><h3>少見格式</h3><p>Micro QR · rMQR · DataBar（在「進階」開啟）</p></section>
          <section><h3>定位標記</h3><p>ArUco 4×4 / 5×5（50、100、250、1000）· Original · MIP 36h12 · AprilTag 36h11</p></section>
          <p className="muted">ChArUco 棋盤請選「定位標記」與對應字典。尚未支援 6×6、7×7 ArUco 與其他 AprilTag 家族。</p>
          <form method="dialog"><button type="submit">關閉</button></form>
        </div>
      </dialog>
    </>
  );
}
