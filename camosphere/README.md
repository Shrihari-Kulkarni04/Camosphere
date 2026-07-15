# 🎓 Camosphere — LIT Sarigam Virtual Campus Tour

A frontend web application for Laxmi Institute of Technology, Sarigam.  
Built with **pure HTML, CSS, and JavaScript** — no frameworks.

---

## 📁 Project Structure

```
camosphere/
├── index.html              ← Home Page
├── student-login.html      ← Student Portal
├── teacher-login.html      ← Teacher Portal
├── admin-login.html        ← Admin Portal
├── visitor-login.html      ← Visitor Portal
├── dashboard.html          ← User Dashboard
├── departments.html        ← Departments Explorer
├── campus-map.html         ← 2D Campus Map
├── events.html             ← Event Calendar
├── virtual-tour.html       ← 3D Virtual Tour
├── guava-ai.html           ← Gauva AI Chatbot
│
├── css/
│   ├── global.css          ← Shared styles (sidebar, variables, reset)
│   ├── home.css
│   ├── login.css           ← Shared by all 4 login pages
│   ├── dashboard.css
│   ├── departments.css
│   ├── campus-map.css
│   ├── events.css
│   ├── virtual-tour.css
│   └── guava-ai.css
│
├── js/
│   ├── global.js           ← Shared logic (active nav, session helpers)
│   ├── home.js
│   ├── login.js            ← Shared by all 4 login pages
│   ├── dashboard.js
│   ├── departments.js
│   ├── campus-map.js
│   ├── events.js
│   ├── virtual-tour.js
│   └── guava-ai.js
│
└── images/
    └── map 2d/             ← Floor map images (A-0.jpeg, A-1.jpeg ... D-2.jpeg)
```

---

## 🚀 How to Run

1. Clone the repo:
   ```bash
   git clone https://github.com/your-username/camosphere.git
   cd camosphere
   ```

2. Open `index.html` directly in your browser — **no server needed!**

   Or use VS Code Live Server extension for best experience.

---

## 🔗 Page Flow

```
index.html (Home)
  └── Get Started → Role Selection
        ├── visitor-login.html
        ├── student-login.html  (New / Existing toggle)
        ├── teacher-login.html
        └── admin-login.html
              └── All logins → dashboard.html
                    ├── departments.html
                    ├── campus-map.html
                    ├── events.html
                    ├── virtual-tour.html
                    └── guava-ai.html
```

---

## 📌 File Linking Rules

Every HTML page links these in order:
```html
<!-- In <head> -->
<link rel="stylesheet" href="css/global.css"/>
<link rel="stylesheet" href="css/[page-name].css"/>

<!-- Before </body> -->
<script src="js/global.js"></script>
<script src="js/[page-name].js"></script>
```

**global.css / global.js must always load first** — they provide shared variables, sidebar, and session helpers.

---

## 🖼️ Adding Campus Map Images

Place floor map images inside `images/map 2d/` folder with these exact filenames:
```
A-0.jpeg, A-1.jpeg , A -2.jpeg
B-0.jpeg, b-1.jpeg, B-2.jpeg
C-0.jpeg, C-1.jpeg, C-2.jpeg
D-0.jpeg, D-1.jpeg, D-2.jpeg
```

---

## 🤖 Gauva AI (Coming Soon)

Currently uses pre-written responses. Real AI integration planned using Anthropic API.  
File to update: `js/guava-ai.js`

---

## 🎨 Theme Colors

| Variable       | Value     | Usage              |
|----------------|-----------|--------------------|
| `--bg`         | `#000000` | Page background    |
| `--sidebar-bg` | `#040a1a` | Sidebar            |
| `--card-bg`    | `#0a192f` | Cards              |
| `--blue`       | `#187bcd` | Primary accent     |
| `--red`        | `#e40046` | Secondary accent   |
| `--cyan`       | `#00bfff` | Highlights         |

---

## 👩‍💻 Team

Developed by Shreya Rai and team — LIT Sarigam

