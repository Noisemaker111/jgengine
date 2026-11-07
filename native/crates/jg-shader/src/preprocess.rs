//! A small C-style preprocessor for the GLSL three.js generates: object- and function-like
//! macros, `#if`/`#ifdef`/`#ifndef`/`#elif`/`#else`/`#endif` with `defined(..)` and integer
//! expressions, `#undef`. Output is macro-free source, so later rewrites see real identifiers.

use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub enum Tok {
    Ident(String),
    Num(String),
    Punct(String),
    Space,
    Newline,
}

impl Tok {
    pub fn text(&self) -> &str {
        match self {
            Tok::Ident(s) | Tok::Num(s) | Tok::Punct(s) => s,
            Tok::Space => " ",
            Tok::Newline => "\n",
        }
    }
    pub fn is(&self, s: &str) -> bool {
        matches!(self, Tok::Punct(p) | Tok::Ident(p) if p == s)
    }
}

const PUNCT3: [&str; 2] = ["<<=", ">>="];
const PUNCT2: [&str; 19] = ["==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "<<", ">>", "^^", "%=", "&=", "|=", "^="];

/// Tokenize one line (or a whole source); comments become spaces.
pub fn tokenize(src: &str) -> Vec<Tok> {
    let b = src.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c == b'\n' {
            out.push(Tok::Newline);
            i += 1;
        } else if c == b'/' && i + 1 < b.len() && b[i + 1] == b'/' {
            while i < b.len() && b[i] != b'\n' {
                i += 1;
            }
        } else if c == b'/' && i + 1 < b.len() && b[i + 1] == b'*' {
            i += 2;
            while i + 1 < b.len() && !(b[i] == b'*' && b[i + 1] == b'/') {
                if b[i] == b'\n' {
                    out.push(Tok::Newline);
                }
                i += 1;
            }
            i += 2;
            out.push(Tok::Space);
        } else if c.is_ascii_whitespace() {
            while i < b.len() && b[i].is_ascii_whitespace() && b[i] != b'\n' {
                i += 1;
            }
            out.push(Tok::Space);
        } else if c.is_ascii_alphabetic() || c == b'_' {
            let s = i;
            while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'_') {
                i += 1;
            }
            out.push(Tok::Ident(src[s..i].to_string()));
        } else if c.is_ascii_digit() || (c == b'.' && i + 1 < b.len() && b[i + 1].is_ascii_digit()) {
            let s = i;
            while i < b.len() {
                let d = b[i];
                let exp_sign = (d == b'+' || d == b'-') && i > s && (b[i - 1] == b'e' || b[i - 1] == b'E') && !src[s..i].starts_with("0x");
                if d.is_ascii_alphanumeric() || d == b'.' || exp_sign {
                    i += 1;
                } else {
                    break;
                }
            }
            out.push(Tok::Num(src[s..i].to_string()));
        } else {
            let rest = &src[i..];
            let p = PUNCT3.iter().find(|p| rest.starts_with(**p)).copied().or_else(|| PUNCT2.iter().find(|p| rest.starts_with(**p)).copied());
            let p = p.map(|p| p.to_string()).unwrap_or_else(|| (c as char).to_string());
            i += p.len();
            out.push(Tok::Punct(p));
        }
    }
    out
}

#[derive(Clone, Debug)]
struct Macro {
    params: Option<Vec<String>>,
    body: Vec<Tok>,
}

pub struct Preprocessor {
    macros: HashMap<String, Macro>,
}

fn trim(toks: &[Tok]) -> Vec<Tok> {
    let mut v: Vec<Tok> = toks.to_vec();
    while matches!(v.first(), Some(Tok::Space)) {
        v.remove(0);
    }
    while matches!(v.last(), Some(Tok::Space)) {
        v.pop();
    }
    v
}

impl Preprocessor {
    pub fn new() -> Self {
        Preprocessor { macros: HashMap::new() }
    }

    pub fn define(&mut self, name: &str, value: &str) {
        self.macros.insert(name.to_string(), Macro { params: None, body: tokenize(value) });
    }

    /// Expand macros in `toks`. `hide` holds the macros being expanded (no recursion).
    fn expand(&self, toks: &[Tok], hide: &mut Vec<String>) -> Vec<Tok> {
        let mut out = Vec::with_capacity(toks.len());
        let mut i = 0;
        while i < toks.len() {
            let t = &toks[i];
            if let Tok::Ident(name) = t {
                if let Some(m) = self.macros.get(name).filter(|_| !hide.contains(name)) {
                    match &m.params {
                        None => {
                            hide.push(name.clone());
                            let body = self.expand(&m.body, hide);
                            hide.pop();
                            out.extend(body);
                            i += 1;
                            continue;
                        }
                        Some(params) => {
                            // Function-like: needs a following '('.
                            let mut j = i + 1;
                            while j < toks.len() && matches!(toks[j], Tok::Space | Tok::Newline) {
                                j += 1;
                            }
                            if j < toks.len() && toks[j].is("(") {
                                let mut depth = 0;
                                let mut args: Vec<Vec<Tok>> = vec![Vec::new()];
                                let mut k = j;
                                loop {
                                    let tk = &toks[k];
                                    if tk.is("(") {
                                        depth += 1;
                                        if depth > 1 {
                                            args.last_mut().unwrap().push(tk.clone());
                                        }
                                    } else if tk.is(")") {
                                        depth -= 1;
                                        if depth == 0 {
                                            break;
                                        }
                                        args.last_mut().unwrap().push(tk.clone());
                                    } else if tk.is(",") && depth == 1 {
                                        args.push(Vec::new());
                                    } else {
                                        args.last_mut().unwrap().push(tk.clone());
                                    }
                                    k += 1;
                                }
                                let args: Vec<Vec<Tok>> = args.iter().map(|a| self.expand(&trim(a), hide)).collect();
                                let mut body = Vec::new();
                                for bt in &m.body {
                                    if let Tok::Ident(p) = bt {
                                        if let Some(ix) = params.iter().position(|q| q == p) {
                                            if let Some(a) = args.get(ix) {
                                                body.extend(a.iter().cloned());
                                            }
                                            continue;
                                        }
                                    }
                                    body.push(bt.clone());
                                }
                                hide.push(name.clone());
                                let body = self.expand(&body, hide);
                                hide.pop();
                                out.extend(body);
                                i = k + 1;
                                continue;
                            }
                        }
                    }
                }
            }
            out.push(t.clone());
            i += 1;
        }
        out
    }

    fn eval(&self, line: &[Tok]) -> Result<bool, String> {
        // Replace defined(X) / defined X before expansion.
        let mut toks = Vec::new();
        let mut i = 0;
        let line: Vec<Tok> = line.iter().filter(|t| !matches!(t, Tok::Space)).cloned().collect();
        while i < line.len() {
            if line[i].is("defined") {
                let (name, skip) = if i + 1 < line.len() && line[i + 1].is("(") { (line[i + 2].text().to_string(), 4) } else { (line[i + 1].text().to_string(), 2) };
                toks.push(Tok::Num(if self.macros.contains_key(&name) { "1".into() } else { "0".into() }));
                i += skip;
            } else {
                toks.push(line[i].clone());
                i += 1;
            }
        }
        let toks: Vec<Tok> = self.expand(&toks, &mut Vec::new()).into_iter().filter(|t| !matches!(t, Tok::Space)).collect();
        let mut p = Expr { t: &toks, i: 0 };
        let v = p.or()?;
        Ok(v != 0)
    }

    /// Run over a whole source. Directives other than conditionals/defines are dropped, except
    /// `#version`/`#extension`, which the caller replaces.
    pub fn run(&mut self, src: &str) -> Result<String, String> {
        // Join continued lines.
        let src = src.replace("\\\r\n", " ").replace("\\\n", " ");
        let mut out = String::with_capacity(src.len());
        // Stack of (this branch active, any branch taken, parent active).
        let mut stack: Vec<(bool, bool, bool)> = Vec::new();
        let active = |stack: &Vec<(bool, bool, bool)>| stack.last().is_none_or(|s| s.0);
        for raw in src.lines() {
            let line = raw.trim_start();
            if let Some(d) = line.strip_prefix('#') {
                let toks = tokenize(d);
                let toks: Vec<Tok> = trim(&toks);
                let word = toks.first().map(|t| t.text().to_string()).unwrap_or_default();
                let rest = trim(toks.get(1..).unwrap_or(&[]));
                let on = active(&stack);
                match word.as_str() {
                    "ifdef" | "ifndef" => {
                        let name = rest.first().map(|t| t.text()).unwrap_or("");
                        let def = self.macros.contains_key(name);
                        let v = on && (def == (word == "ifdef"));
                        stack.push((v, v, on));
                    }
                    "if" => {
                        let v = on && self.eval(&rest)?;
                        stack.push((v, v, on));
                    }
                    "elif" => {
                        let top = stack.last_mut().ok_or("#elif without #if")?;
                        let parent = top.2;
                        let taken = top.1;
                        let v = parent && !taken && self.eval(&rest)?;
                        let top = stack.last_mut().unwrap();
                        top.0 = v;
                        top.1 = taken || v;
                    }
                    "else" => {
                        let top = stack.last_mut().ok_or("#else without #if")?;
                        top.0 = top.2 && !top.1;
                        top.1 = true;
                    }
                    "endif" => {
                        stack.pop().ok_or("#endif without #if")?;
                    }
                    "define" if on => {
                        let name = rest.first().map(|t| t.text().to_string()).ok_or("#define without name")?;
                        // Function-like only when '(' follows the name immediately.
                        let after = d.trim_start().strip_prefix("define").unwrap().trim_start();
                        let after = &after[name.len()..];
                        if after.starts_with('(') {
                            let close = after.find(')').ok_or("bad macro params")?;
                            let params: Vec<String> = after[1..close].split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
                            let body = trim(&tokenize(&after[close + 1..]));
                            self.macros.insert(name, Macro { params: Some(params), body });
                        } else {
                            let body = trim(&tokenize(after));
                            self.macros.insert(name, Macro { params: None, body });
                        }
                    }
                    "undef" if on => {
                        if let Some(t) = rest.first() {
                            self.macros.remove(t.text());
                        }
                    }
                    "version" | "extension" | "pragma" | "line" | "error" | "define" | "undef" | "" => {}
                    other => return Err(format!("unknown directive #{other}")),
                }
                out.push('\n');
                continue;
            }
            if active(&stack) {
                let toks = self.expand(&tokenize(raw), &mut Vec::new());
                for t in toks {
                    out.push_str(t.text());
                }
            }
            out.push('\n');
        }
        Ok(out)
    }
}

impl Default for Preprocessor {
    fn default() -> Self {
        Self::new()
    }
}

struct Expr<'a> {
    t: &'a [Tok],
    i: usize,
}

impl Expr<'_> {
    fn peek(&self) -> Option<&str> {
        self.t.get(self.i).map(|t| t.text())
    }
    fn eat(&mut self, s: &str) -> bool {
        if self.peek() == Some(s) {
            self.i += 1;
            true
        } else {
            false
        }
    }
    fn or(&mut self) -> Result<i64, String> {
        let mut v = self.and()?;
        while self.eat("||") {
            let r = self.and()?;
            v = ((v != 0) || (r != 0)) as i64;
        }
        Ok(v)
    }
    fn and(&mut self) -> Result<i64, String> {
        let mut v = self.cmp()?;
        while self.eat("&&") {
            let r = self.cmp()?;
            v = ((v != 0) && (r != 0)) as i64;
        }
        Ok(v)
    }
    fn cmp(&mut self) -> Result<i64, String> {
        let mut v = self.add()?;
        loop {
            let op = match self.peek() {
                Some(o @ ("==" | "!=" | "<" | ">" | "<=" | ">=")) => o.to_string(),
                _ => return Ok(v),
            };
            self.i += 1;
            let r = self.add()?;
            v = match op.as_str() {
                "==" => v == r,
                "!=" => v != r,
                "<" => v < r,
                ">" => v > r,
                "<=" => v <= r,
                _ => v >= r,
            } as i64;
        }
    }
    fn add(&mut self) -> Result<i64, String> {
        let mut v = self.mul()?;
        loop {
            if self.eat("+") {
                v += self.mul()?;
            } else if self.eat("-") {
                v -= self.mul()?;
            } else {
                return Ok(v);
            }
        }
    }
    fn mul(&mut self) -> Result<i64, String> {
        let mut v = self.unary()?;
        loop {
            if self.eat("*") {
                v *= self.unary()?;
            } else if self.eat("/") {
                let r = self.unary()?;
                v = if r == 0 { 0 } else { v / r };
            } else {
                return Ok(v);
            }
        }
    }
    fn unary(&mut self) -> Result<i64, String> {
        if self.eat("!") {
            return Ok((self.unary()? == 0) as i64);
        }
        if self.eat("-") {
            return Ok(-self.unary()?);
        }
        if self.eat("(") {
            let v = self.or()?;
            self.eat(")");
            return Ok(v);
        }
        let t = self.t.get(self.i).ok_or("unexpected end of #if")?;
        self.i += 1;
        match t {
            Tok::Num(n) => {
                let n = n.trim_end_matches(['u', 'U', 'l', 'L']);
                Ok(n.parse::<f64>().map(|f| f as i64).or_else(|_| i64::from_str_radix(n.trim_start_matches("0x"), 16)).unwrap_or(0))
            }
            // An undefined identifier is 0, as in C.
            Tok::Ident(_) => Ok(0),
            other => Err(format!("bad #if token {other:?}")),
        }
    }
}
