import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="page">
      <h1>Page introuvable</h1>
      <p>Cette adresse ne correspond à aucun écran de l’application.</p>
      <p>
        <Link className="button button--primary" to="/">
          Retour à la carte
        </Link>
      </p>
    </div>
  )
}
