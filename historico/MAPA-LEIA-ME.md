# Mapa do Brasil

Abra analise.html diretamente no navegador. Three.js e os contornos estão incorporados ao HTML, sem downloads durante a execução do mapa. WebGL precisa estar disponível.

Malha: API de malhas simplificadas do IBGE, 27 UFs, qualidade mínima. URL de coleta: https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF . Consulta em 30/10/2026. O parâmetro de período não foi especificado; corresponde à resposta da API nessa coleta. A malha simplificada não serve para delimitação cadastral.

Espessura ilustrativa constante; elevação ao selecionar é uma indicação visual, não relevo topográfico. Coordenadas exibidas em projeção equiretangular com ajuste de longitude na latitude de 15 graus sul. Clique aproxima a UF; arraste inclina; roda aproxima/afasta. A navegação termina no nível estadual.

ZZ significa Exterior na base TSE e não é uma UF geográfica. Use o botão Exterior (ZZ) para consultar seus dados. Passe o mouse nas siglas para ler o nome completo.

Dados eleitorais são a coleta já documentada, sem atualização automática. Cores mostram taxas descritivas e não candidaturas. Os horários ainda são brutos, sem normalização de fusos.

Verificação: sintaxe dos scripts, carregamento do módulo Three.js embutido e construção das 27 geometrias (36 polígonos, incluindo ilhas) em Node.js. A verificação visual no navegador não foi realizada porque o acesso automatizado foi negado pela política de aprovação da sessão.
