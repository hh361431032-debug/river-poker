import React, { useEffect, useState } from "react";

const lines = {
  waiting: "欢迎来到河畔牌局，等大家到齐我们就开始。",
  preflop: "底牌已经发出，请各位玩家开始行动。",
  flop: "翻牌圈开始，看看牌面会给谁带来机会。",
  turn: "转牌已经发出，局势越来越紧张了。",
  river: "最后一张公共牌！这是决定胜负的关键时刻。",
  handover: "这一局结束啦，祝贺赢家！准备下一局吧。",
};

const LUNA_IMAGE = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=85";

export default function Dealer({ room, dealing }) {
  const [text, setText] = useState(lines.waiting);

  useEffect(() => {
    if (dealing) {
      setText("正在发牌，请稍等……");
      return;
    }
    setText(lines[room?.stage] || lines.waiting);
  }, [room?.stage, dealing, room?.handNumber]);

  return (
    <div className="dealer-box">
      <div className={`dealer-avatar ${dealing ? "dealing" : ""}`}>
        <img
          src={LUNA_IMAGE}
          alt="Luna 荷官"
          style={{
            width: "88px",
            height: "105px",
            objectFit: "cover",
            objectPosition: "center 25%",
            borderRadius: "48% 48% 38% 38%",
            border: "2px solid #d5b75a",
            boxShadow: "0 4px 14px #0009",
            display: "block",
          }}
        />
      </div>
      <div className="dealer-info">
        <div className="dealer-name"><span className="live-dot"></span> Luna · 荷官</div>
        <div className="dealer-text">{text}</div>
      </div>
      <div className="dealer-card-stack">
        <div className="mini-card"></div>
        <div className="mini-card"></div>
        <div className="mini-card"></div>
      </div>
    </div>
  );
}
