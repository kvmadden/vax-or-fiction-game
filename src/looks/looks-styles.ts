// The stylesheets of the three drawn looks. LookRoot loads this module only when a page first wears a look other
// than Today, so a page in Today, which is every phone in a room, every solo round and every site page, never
// downloads them. Every rule in them is scoped by :root[data-look].
import "./looks.css";
import "./studio.css";
import "./casefile.css";
import "./seventies.css";
