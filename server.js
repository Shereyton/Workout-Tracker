const express = require('express');
const app = express();
app.use(express.json());

// In-memory user store
const users = {
  'user@example.com': {
    password: 'password',
    data: { wt_history: {}, templates: {}, updatedAt: 0 }
  }
};
const tokens = {};

function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !tokens[token]) return res.status(401).json({ error: 'unauthorized' });
  req.email = tokens[token];
  req.user = users[req.email];
  next();
}

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = users[email];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = Math.random().toString(36).slice(2);
  tokens[token] = email;
  res.json({ token });
});

app.post('/api/logout', auth, (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.split(' ')[1];
  delete tokens[token];
  res.json({ ok: true });
});

app.get('/api/data', auth, (req, res) => {
  res.json(req.user.data);
});

app.post('/api/data', auth, (req, res) => {
  const payload = req.body || {};
  const serverData = req.user.data;
  if (serverData.updatedAt > (payload.updatedAt || 0)) {
    return res.status(409).json(serverData);
  }
  req.user.data = {
    wt_history: payload.wt_history || {},
    templates: payload.templates || {},
    updatedAt: Date.now()
  };
  res.json({ ok: true, updatedAt: req.user.data.updatedAt });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
