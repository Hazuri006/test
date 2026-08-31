# Mesures de latence

Une entrée par session de mesure, datée, avec l'environnement. Les budgets sont
ceux de la section 3 de la spécification.

## Comment produire une entrée

```
Babel.exe --bench 60
```

Fait tourner la chaîne pendant 60 secondes avec le générateur de test, puis ajoute
une entrée à ce fichier et quitte. `Ctrl+Alt+S` écrit un relevé à tout moment
pendant une session normale, et `F9` affiche les mêmes chiffres en direct.

## Ce que mesure chaque ligne

| Ligne | De | À |
|---|---|---|
| Rendu | remise du message à l'overlay | trame composée |
| Bout en bout | entrée du message dans le pipeline | trame composée |

Les deux mesures s'arrêtent à `CompositionTarget.Rendering`, c'est-à-dire juste
avant la composition. La présentation à l'écran suit d'un balayage vertical —
16,7 ms à 60 Hz, 6,9 ms à 144 Hz. Ce délai n'est pas compté ici : il n'est ni
mesurable depuis le processus, ni réductible. Chaque entrée note la cadence de
composition observée pour que le chiffre soit lisible.

Les étages Capture, VAD, ASR et Traduction n'existent pas encore. Ils apparaissent
avec un tiret jusqu'aux jalons qui les introduisent.

---

## Aucune mesure à ce jour

Le jalon M0 est écrit mais n'a pas encore été exécuté. L'environnement de
développement utilisé pour le produire tourne sous Linux et ne peut ni compiler ni
lancer WPF : la compilation du markup WPF n'existe pas hors Windows. La
compilation est vérifiée par l'intégration continue sur `windows-latest` ; la
mesure, elle, demande une vraie session de bureau avec un GPU, donc une machine
Windows.

**Prochaine étape :** lancer `Babel.exe --bench 60` sur la machine cible et
laisser l'application remplir la première entrée ci-dessous. Le budget à tenir
pour M0 est un p95 de rendu sous 16 ms.
