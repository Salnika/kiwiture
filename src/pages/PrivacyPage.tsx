import { Link } from 'react-router-dom'
import { providerFamily } from '@/config/env'

/** Privacy notice (spec 34). */
export default function PrivacyPage() {
  const family = providerFamily()

  return (
    <div className="page">
      <div className="page__header">
        <Link className="button button--ghost" to="/">
          ← Carte
        </Link>
        <h1>Confidentialité</h1>
      </div>

      <section>
        <h2>En résumé</h2>
        <p>
          Kiwiture n’a aucun serveur applicatif, aucune base de données et aucun compte utilisateur.
          Votre position n’est <strong>jamais</strong> envoyée à un serveur appartenant au projet —
          il n’en existe pas.
        </p>
      </section>

      <section>
        <h2>Ce qui reste sur votre appareil</h2>
        <ul>
          <li>vos préférences (tri, filtres, énergie à recharger, application de navigation) ;</li>
          <li>vos véhicules ;</li>
          <li>le cache des bornes, itinéraires et adresses recherchées.</li>
        </ul>
        <p>
          Tout cela vit dans le stockage local de votre navigateur (localStorage et IndexedDB) et
          peut être supprimé à tout moment depuis les{' '}
          <Link to="/reglages">réglages</Link>.
        </p>
      </section>

      <section>
        <h2>Ce qui est transmis à des tiers</h2>
        <p>
          Pour afficher une carte, chercher une adresse ou calculer un itinéraire, le navigateur
          doit contacter des services externes. Ces services reçoivent alors les coordonnées
          nécessaires à la requête.
        </p>
        <ul>
          <li>
            <strong>Données des bornes</strong> : data.gouv.fr (API tabulaire). Reçoit la zone
            géographique recherchée.
          </li>
          {family === 'mapbox' ? (
            <li>
              <strong>Carte, géocodage et itinéraires</strong> : Mapbox. Reçoit votre position et vos
              destinations lorsque ces fonctions sont utilisées.
            </li>
          ) : (
            <>
              <li>
                <strong>Fonds de carte</strong> : CARTO / OpenStreetMap. Reçoit la zone affichée.
              </li>
              <li>
                <strong>Géocodage</strong> : Base Adresse Nationale (data.gouv.fr). Reçoit le texte
                recherché et, éventuellement, une position approchée.
              </li>
              <li>
                <strong>Itinéraires</strong> : OSRM. Reçoit les points de départ, d’arrivée et les
                bornes évaluées.
              </li>
            </>
          )}
        </ul>
        <p>
          Ces échanges sont indispensables au fonctionnement de ces trois fonctions. Sans
          géolocalisation, l’application reste utilisable via la recherche d’adresse.
        </p>
      </section>

      <section>
        <h2>Mesure d’audience</h2>
        <p>
          Aucun outil d’analytics, aucun traceur publicitaire, aucun cookie tiers ne sont utilisés.
        </p>
      </section>
    </div>
  )
}
