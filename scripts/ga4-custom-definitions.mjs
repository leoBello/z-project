#!/usr/bin/env node
/**
 * Déclare dans GA4 les paramètres d'événement émis par le jeu.
 *
 *     node scripts/ga4-custom-definitions.mjs <clé-de-compte-de-service.json>
 *     node scripts/ga4-custom-definitions.mjs <clé.json> --dry-run
 *
 * **Pourquoi ce script existe.** GA4 reçoit et conserve les paramètres de
 * chaque événement — `landmark`, `hearts`, `attack`… — mais n'en affiche aucun
 * tant qu'ils n'ont pas été déclarés en « définition personnalisée ». Rien ne
 * le signale, et les données d'avant la déclaration ne remontent pas : un
 * paramètre déclaré en retard est perdu pour la période écoulée. Ça fait
 * vingt et un formulaires de trois champs à remplir à la main, où une seule
 * lettre mal recopiée donne une colonne vide qu'on découvre des semaines plus
 * tard — exactement la panne silencieuse que le reste du projet s'applique à
 * éviter.
 *
 * La liste ci-dessous est donc **le miroir de `src/analytics/index.ts`**. Y
 * ajouter une entrée en même temps qu'un paramètre d'événement, et relancer.
 *
 * **Il se relance sans risque.** Les définitions déjà en place sont lues avant
 * d'écrire quoi que ce soit, et sautées. Rien n'est modifié ni supprimé — un
 * libellé retouché à la main dans l'interface reste tel quel.
 *
 * **Il ne demande pas quelle propriété viser**, et c'est délibéré : un numéro
 * de propriété recopié à la main est la seule façon de créer vingt et une
 * définitions dans le compte d'à côté. Il lit l'identifiant de mesure dans
 * `.env`, parcourt les flux de données des propriétés accessibles, et travaille
 * sur celle qui porte ce flux — ou s'arrête.
 *
 * **L'accès.** Un compte de service (celui de Firebase fait l'affaire) dont
 * l'adresse a été ajoutée en rôle **Éditeur** dans GA4 > Admin > Gestion des
 * accès à la propriété. La clé JSON est un identifiant de longue durée : elle
 * se garde hors du dépôt, et se supprime une fois le travail fait.
 */

import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

/* --- Ce qu'il y a à déclarer -------------------------------------------------- */

/**
 * Les paramètres textuels : ils répondent à « lequel », et découpent un rapport
 * en lignes.
 */
const DIMENSIONS = [
  ['landmark', 'Monument', 'Quelle rubrique du portfolio est ouverte.'],
  ['slide', 'Diapositive', 'Quel projet, école ou contact est atteint dans le panneau.'],
  ['via', 'Chemin', 'À pied ou par téléportation ; par les combats ou par le code de triche.'],
  ['project', 'Projet', 'Le projet dont une capture est ouverte en plein écran.'],
  ['target', 'Lien sortant', 'Domaine du lien cliqué, ou « email ».'],
  ['attack', 'Attaque parée', "Laquelle des annonces du boss a été lue à temps."],
  ['phase', 'Phase', 'La phase du boss au moment de l’événement.'],
  ['outcome', 'Issue du chargement', 'Le monde est devenu jouable, ou le filet de sécurité a pris le relais.'],
  ['difficulty', 'Difficulté', 'Le réglage de difficulté du défi.'],
  ['duration', 'Durée du défi', 'La durée choisie pour le défi.'],
  ['locale', 'Langue choisie', 'La langue posée à la main, donc contre la détection automatique.'],
  ['from', 'Cause de la mort', 'Ce qui a porté le dernier coup.'],
  ['location', 'Carte', 'Sur quelle carte l’événement a eu lieu.'],
  ['failed', 'Défi perdu', 'Le défi s’est terminé par une mort (« true » / « false »).'],
]

/**
 * Les paramètres numériques : ils répondent à « combien », et se totalisent.
 *
 * L'unité n'est pas cosmétique — c'est elle qui fait afficher « 1,2 s » plutôt
 * que « 1200 » dans les rapports.
 */
const METRICS = [
  ['ms', 'Durée du chargement', 'Temps écoulé avant que le monde soit jouable.', 'MILLISECONDS'],
  ['seconds', 'Temps dans le panneau', 'Durée pendant laquelle une rubrique est restée ouverte.', 'SECONDS'],
  ['slides', 'Pages lues', 'Nombre de diapositives vues avant de refermer le panneau.', 'STANDARD'],
  ['index', 'Rang', 'Rang de la diapositive ou de la photo ouverte.', 'STANDARD'],
  ['hearts', 'Cœurs restants', 'Cœurs qu’il restait au joueur.', 'STANDARD'],
  ['score', 'Score', 'Score obtenu au défi.', 'STANDARD'],
  ['kills', 'Ennemis tués', 'Bêtes abattues pendant le défi.', 'STANDARD'],
]

const API = 'https://analyticsadmin.googleapis.com/v1beta'

/* --- L'accès ------------------------------------------------------------------ */

/**
 * Échange la clé du compte de service contre un jeton d'accès.
 *
 * Le flux « JWT bearer » de Google, écrit à la main : il tient en vingt lignes
 * avec le `crypto` de Node, là où la bibliothèque officielle ajouterait une
 * dépendance à un dépôt qui n'en a aucune pour ses scripts.
 */
async function accessToken(keyPath) {
  const key = JSON.parse(readFileSync(keyPath, 'utf8'))
  if (!key.client_email || !key.private_key) {
    throw new Error(`${keyPath} n'est pas une clé de compte de service.`)
  }

  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.edit',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const base = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${base({ alg: 'RS256', typ: 'JWT' })}.${base(claim)}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`jeton refusé : ${JSON.stringify(body)}`)
  return { token: body.access_token, email: key.client_email }
}

/** Un appel à l'API Admin, avec le message d'erreur de Google conservé tel quel. */
async function call(token, path, options = {}) {
  const response = await fetch(`${API}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? `HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return body
}

/* --- Trouver la bonne propriété ----------------------------------------------- */

/** L'identifiant de flux (`G-…`) tel que le build l'utilisera. */
function measurementIdFromEnv() {
  let env = ''
  try {
    env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  } catch {
    throw new Error('pas de `.env` à la racine : impossible de savoir quelle propriété viser.')
  }
  for (const key of ['VITE_GA_MEASUREMENT_ID', 'VITE_FIREBASE_MEASUREMENT_ID']) {
    const found = env.match(new RegExp(`^${key}=(G-\\S+)`, 'm'))
    if (found) return found[1]
  }
  throw new Error('aucun identifiant `G-…` dans `.env`.')
}

/**
 * La propriété qui porte ce flux, et elle seule.
 *
 * On parcourt, plutôt que de demander le numéro : c'est le seul moyen d'être
 * sûr d'écrire dans la propriété que le site alimente réellement.
 */
async function findProperty(token, measurementId) {
  const summaries = await call(token, 'accountSummaries?pageSize=200')
  const properties = (summaries.accountSummaries ?? []).flatMap((account) =>
    (account.propertySummaries ?? []).map((property) => ({
      name: property.property,
      label: `${account.displayName} › ${property.displayName}`,
    })),
  )
  if (properties.length === 0) {
    throw new Error(
      "aucune propriété visible. L'adresse du compte de service a-t-elle été ajoutée dans GA4 > Admin > Gestion des accès à la propriété, en rôle Éditeur ?",
    )
  }

  for (const property of properties) {
    const streams = await call(token, `${property.name}/dataStreams?pageSize=200`)
    for (const stream of streams.dataStreams ?? []) {
      if (stream.webStreamData?.measurementId === measurementId) return property
    }
  }
  throw new Error(
    `aucune propriété accessible ne porte le flux ${measurementId} (vu : ${properties.map((p) => p.label).join(', ')}).`,
  )
}

/* --- Le travail --------------------------------------------------------------- */

/**
 * Crée ce qui manque, saute ce qui existe.
 *
 * La comparaison porte sur `parameterName` et non sur le libellé : c'est lui
 * qui lie la définition aux données, et lui seul qu'il ne faut pas doubler.
 */
async function sync(token, property, kind, wanted, dryRun) {
  const collection = kind === 'dimension' ? 'customDimensions' : 'customMetrics'
  const listed = await call(token, `${property.name}/${collection}?pageSize=200`)
  const existing = new Set(
    (listed[collection] ?? []).map((definition) => definition.parameterName),
  )

  let created = 0
  for (const entry of wanted) {
    const [parameterName, displayName, description, unit] = entry
    if (existing.has(parameterName)) {
      console.log(`  · ${parameterName.padEnd(12)} déjà déclaré`)
      continue
    }
    if (dryRun) {
      console.log(`  + ${parameterName.padEnd(12)} à créer — « ${displayName} »`)
      created += 1
      continue
    }
    const body = { parameterName, displayName, description, scope: 'EVENT' }
    if (kind === 'metric') body.measurementUnit = unit
    try {
      await call(token, `${property.name}/${collection}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      console.log(`  + ${parameterName.padEnd(12)} créé — « ${displayName} »`)
      created += 1
    } catch (error) {
      // On continue : un nom refusé par Google — réservé, ou au-delà du quota —
      // ne doit pas emporter les vingt autres avec lui.
      console.error(`  ! ${parameterName.padEnd(12)} refusé : ${error.message}`)
    }
  }
  return created
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const keyPath = args.find((arg) => !arg.startsWith('--'))
  if (!keyPath) {
    console.error('usage : node scripts/ga4-custom-definitions.mjs <clé.json> [--dry-run]')
    process.exit(2)
  }

  const measurementId = measurementIdFromEnv()
  const { token, email } = await accessToken(keyPath)
  console.log(`compte de service : ${email}`)
  console.log(`flux visé         : ${measurementId}`)

  const property = await findProperty(token, measurementId)
  console.log(`propriété         : ${property.label} (${property.name})`)
  if (dryRun) console.log('\n-- essai à blanc, rien ne sera écrit --')

  console.log('\nDimensions :')
  const dimensions = await sync(token, property, 'dimension', DIMENSIONS, dryRun)
  console.log('\nMétriques :')
  const metrics = await sync(token, property, 'metric', METRICS, dryRun)

  const verb = dryRun ? 'à créer' : 'créées'
  console.log(`\n${dimensions} dimension(s) et ${metrics} métrique(s) ${verb}.`)
  if (!dryRun && dimensions + metrics > 0) {
    console.log(
      'Compter 24 à 48 h avant de les voir dans les rapports standard ; le DebugView, lui, répond tout de suite.',
    )
  }
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`)
  process.exit(1)
})
