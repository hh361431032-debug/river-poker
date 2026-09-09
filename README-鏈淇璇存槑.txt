本次修复重点：
1. 开房设置的起始筹码写入 room.startingChips；后加入玩家优先读取该值。
2. 兼容旧等待房间：如果没有 startingChips，则参考首位玩家当前筹码作为加入筹码。
3. 新玩家可以在游戏中直接加入，waitingForNext=true，只能等待下一手。
4. 每个新街（翻牌/转牌/河牌）重新设置 turnStartedAt，修复倒计时沿用上一轮时间的问题。
5. 自动弃牌仅由房主浏览器执行，避免多个客户端同时超时写入造成竞态。
6. 房主才可开始下一局。
7. 管理员 RiverAdmin 可删除公开房间。
8. 房主可踢人；游戏中踢人按本局弃牌、下一局移除处理。
9. 保留美女荷官、聊天室、音效、Supabase 实时同步。

管理员账号：RiverAdmin
管理员密码：river2026

部署前必须在 Vercel / 腾讯云环境变量中配置：
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
