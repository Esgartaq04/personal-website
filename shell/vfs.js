// Virtual filesystem for /root. TREE is data: add files by editing it, not the functions below.
// It holds nothing the public site does not already show — no phone number, no email.

export const HOME = '/home/esteban'

const dir = children => ({ type: 'dir', children })
const text = (...lines) => ({ type: 'file', content: lines.join('\n') })

export const TREE = dir({
  etc: dir({
    motd: text('welcome to egt.agency.', 'everything here is read-only, including your chances of breaking it.'),
  }),
  home: dir({
    esteban: dir({
      'about.txt': text(
        'Esteban Garcia Taquez',
        'Computer Science @ University of Illinois at Chicago, class of 2027',
        'Concentration in Software Engineering, Minors in Mathematics and Philosophy',
        '',
        'I build secure, scalable applications, and I like hackathons',
        'as much as capture the flags.',
      ),
      'contact.txt': text(
        'web       https://egt.agency',
        'github    https://github.com/Esgartaq04',
        'linkedin  https://linkedin.com/in/esteban-garcia-taquez',
        '',
        'or use the form on the contact page.',
      ),
      'notes.txt': text('todo', '[x] ship the site', '[x] hide things in it', '[x] wait for someone to find them', '[ ] add a second game'),
      '.secret': text('you found the hidden file. most people never type ls -a.', '', 'there is no deeper secret. but there is a game.', 'try: snake'),
      experience: dir({
        'morningstar.log': text(
          'Software Engineering Intern, Technology Intern Program',
          'Morningstar, Chicago IL :: Mar 2026 - Aug 2026',
          '',
          '- Shipped a self-service AI pipeline platform on AWS used by 2,000+',
          '  analysts across 5 global offices to build RAG workflows over',
          '  1,000+ financial documents.',
          '- Cut data-collection turnaround from a 5-week build-and-test cycle',
          '  to under a minute.',
          '- Reduced rule authoring from 2 weeks to 2 minutes on a production',
          '  data-validation engine (Vue, FastAPI, MySQL).',
        ),
        'uic-policy-as-code.log': text(
          'Software Engineering Intern',
          'University of Illinois at Chicago :: May 2024 - Sep 2024',
          '',
          '- Built the GDPR dependency analyzer for a Policy as Code framework',
          '  spanning all 99 GDPR articles.',
          '- Added the parser that turns Legalease policy strings into Python',
          '  objects, feeding a static analyzer that checks programs against them.',
          '- Translated GDPR regulatory language into machine-checkable specs.',
        ),
        'shpe-member-platform.log': text(
          'Technical Lead, Member Platform',
          'SHPE, UIC Chapter :: Feb 2026 - Present',
          '',
          '- Lead a team of junior engineers building the chapter member platform',
          '  for 150+ members and 23 officers.',
          '- Rotating check-in codes and an officer review queue that surfaced',
          '  attendance inflated by 30%.',
          '- Terraform on GCP at $11/month, 201 passing tests, and a WCAG 2.2 AA',
          '  gate in GitHub Actions (Playwright + axe-core).',
        ),
        'lunabotics.log': text(
          'Control Systems & Autonomy Team Member',
          'UIC Lunabotics :: Jan 2026 - Present',
          '',
          '- LiDAR and computer-vision perception for one-button autonomous',
          '  excavation in NASA\'s competition arena.',
          '- ROS nodes for each servo motor.',
          '- Custom compression to fit a live camera feed in a 4 kbps link.',
        ),
        'tutoring.log': text(
          'Academic Tutor',
          'University of Illinois at Chicago :: Sep 2024 - Present',
          '',
          '- Tutor 50+ students a semester in algorithms, data structures,',
          '  systems programming, cryptography, and calculus.',
        ),
      }),
      projects: dir({
        'resume-review.md': text(
          '# Resume Review',
          'Python, FastAPI, React, TypeScript, Claude API :: Sep 2026',
          '',
          'Takes a PDF resume and a job description, returns structured feedback',
          'validated against Pydantic schemas. Hardened against prompt injection.',
        ),
        'trading-bot.md': text(
          '# Algorithmic Trading Bot',
          'Python, LLMs, Docker :: May 2026 - Aug 2026',
          '',
          'Started at ProphetHacks (UChicago). Trades Kalshi event contracts with',
          'LLM forecasts and Kelly Criterion sizing on 15-minute bars.',
          'Grew a $10,000 simulated account to $15,000 over 3 months.',
        ),
        'interview-prep-bot.md': text(
          '# Interview Prep Bot',
          'Python, Docker, GCP, GraphQL :: Sep 2025 - May 2026',
          '',
          'Discord bot serving 100+ commands a day and 1,000+ LeetCode problems,',
          'at 99.9% uptime across the academic year.',
        ),
        'wikiverify.md': text(
          '# WikiVerify',
          'n8n, OpenAI API, Firestore :: Apr 2026',
          '',
          'Human-augmented AI pipeline that has verified 1,800+ citations across',
          '100+ Wikipedia articles. Replaced LLM claim extraction with regex',
          'parsing to remove a rate-limit bottleneck.',
        ),
        'sparkhacks-26.md': text(
          '# Content Creator Analytics Platform',
          'TypeScript, React, Express, Firebase :: Feb 2026',
          '',
          "Third of 30 teams at SparkHacks '26. Built in 24 hours, load-tested to",
          '500+ concurrent users.',
        ),
      }),
    }),
  }),
})

export function resolvePath(cwd, input, home = HOME) {
  let raw = input
  if (raw === '~' || raw.startsWith('~/')) raw = home + raw.slice(1)
  const segments = raw.startsWith('/') ? raw.split('/') : [...cwd.split('/'), ...raw.split('/')]
  const parts = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return '/' + parts.join('/')
}

export function getNode(tree, absPath) {
  let node = tree
  for (const segment of absPath.split('/').filter(Boolean)) {
    if (node.type !== 'dir' || !Object.hasOwn(node.children, segment)) return null
    node = node.children[segment]
  }
  return node
}

export function listDir(tree, absPath, { all = false } = {}) {
  const node = getNode(tree, absPath)
  if (!node) return { ok: false, error: 'ENOENT' }
  if (node.type !== 'dir') return { ok: false, error: 'ENOTDIR' }
  const names = Object.keys(node.children)
    .filter(name => all || !name.startsWith('.'))
    .sort()
    .map(name => (node.children[name].type === 'dir' ? `${name}/` : name))
  return { ok: true, names }
}

export function readFile(tree, absPath) {
  const node = getNode(tree, absPath)
  if (!node) return { ok: false, error: 'ENOENT' }
  if (node.type !== 'file') return { ok: false, error: 'EISDIR' }
  return { ok: true, content: node.content }
}

export function displayPath(absPath, home = HOME) {
  if (absPath === home) return '~'
  if (absPath.startsWith(home + '/')) return '~' + absPath.slice(home.length)
  return absPath
}
