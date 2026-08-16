import { Link } from 'react-router-dom'
import { providerFamily } from '@/config/env'
import {
  IRVE_DATASET_PAGE_URL,
  IRVE_TRANSPORT_PAGE_URL,
} from '@/features/charging-data/irve/types'

/** Data provenance and its limits (spec 22.3, 44, 58). */
export default function AboutDataPage() {
  const family = providerFamily()

  return (
    <div className="page">
      <div className="page__header">
        <Link className="button button--ghost" to="/">
          ← Carte
        </Link>
        <h1>Données et limites</h1>
      </div>

      <section>
        <h2>D’où viennent les bornes</h2>
        <p>
          Toutes les bornes proviennent de la <strong>Base nationale des IRVE</strong>
          (Infrastructures de Recharge pour Véhicules Électriques), publiée en open data et
          consolidée par Etalab.
        </p>
        <ul>
          <li>
            <a href={IRVE_TRANSPORT_PAGE_URL} target="_blank" rel="noopener noreferrer">
              transport.data.gouv.fr — Base nationale des IRVE
            </a>
          </li>
          <li>
            <a href={IRVE_DATASET_PAGE_URL} target="_blank" rel="noopener noreferrer">
              data.gouv.fr — jeu de données
            </a>
          </li>
          <li>
            <a
              href="https://schema.data.gouv.fr/etalab/schema-irve-statique/latest/documentation.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Documentation du schéma statique
            </a>
          </li>
        </ul>
        <p>
          La ressource utilisée n’est pas figée dans le code : l’application interroge l’API
          data.gouv.fr pour retrouver la dernière consolidation publiée, puis lit les lignes via
          l’API tabulaire (bêta) en filtrant sur la zone géographique affichée.
        </p>
      </section>

      <section>
        <h2>Pourquoi le prix n’est pas toujours affiché</h2>
        <p>
          Dans le schéma IRVE, la tarification est un <strong>champ de texte libre</strong>, pas un
          modèle tarifaire structuré. Un opérateur peut y écrire « 0,40 €/kWh pour les non
          abonnés », « Tarification selon abonnement », ou ne rien renseigner du tout.
        </p>
        <p>L’application distingue donc quatre situations, et ne les mélange jamais :</p>
        <ul>
          <li>
            <strong>Prix vérifié</strong> — garanti par une source structurée fiable. Aucune source
            de ce type n’est disponible aujourd’hui : cette mention n’apparaît pas.
          </li>
          <li>
            <strong>Prix publié</strong> — valeur lue dans le texte tarifaire IRVE et interprétée
            automatiquement.
          </li>
          <li>
            <strong>Prix estimé</strong> — calcul effectué à partir d’une donnée partielle.
          </li>
          <li>
            <strong>Prix non disponible</strong> — le texte est absent, ambigu ou conditionnel. Rien
            n’est inventé : le texte brut publié reste consultable sur la fiche.
          </li>
        </ul>
        <p>
          Les montants sont toujours présentés comme des estimations (« ≈ 14,73 € »), jamais comme
          un tarif contractuel.
        </p>
      </section>

      <section>
        <h2>Disponibilité en temps réel</h2>
        <p>
          L’application n’affiche <strong>pas</strong> la disponibilité en temps réel : aucune source
          fiable et exhaustive n’est accessible depuis le navigateur sans backend. Le nombre de
          points de charge indiqué est le nombre total décrit dans les données, pas le nombre de
          bornes libres à cet instant.
        </p>
      </section>

      <section>
        <h2>Distances</h2>
        <p>
          Trois distances différentes coexistent et ne sont jamais confondues : la distance à vol
          d’oiseau (calculée localement, servant à pré-filtrer), la distance routière (calculée par
          un service d’itinéraire pour une courte liste de bornes), et le détour, qui compare
          l’itinéraire direct vers votre destination à l’itinéraire passant par la borne.
        </p>
      </section>

      <section>
        <h2>Services utilisés</h2>
        <p>
          {family === 'mapbox'
            ? 'Carte, géocodage et itinéraires : Mapbox (jeton public restreint au domaine).'
            : 'Carte : MapLibre GL avec des tuiles CARTO basées sur OpenStreetMap. Géocodage : Base Adresse Nationale (data.gouv.fr). Itinéraires : OSRM (données OpenStreetMap).'}
        </p>
        <p>
          L’application est entièrement statique : elle n’a ni serveur applicatif, ni base de
          données, ni compte utilisateur. Voir la{' '}
          <Link to="/confidentialite">page confidentialité</Link>.
        </p>
      </section>
    </div>
  )
}
