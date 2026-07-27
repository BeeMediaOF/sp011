# Especificação Funcional — Editor de Design (Clone do Canva)
TUDO DEVE SER USADO COMO EXEMPLO E INSPIRAÇÃO
> Prompt de criação para replicar as funcionalidades de edição observadas no editor
> Canva (template "BeeSports"). O objetivo é reconstruir um editor de design 2D em
> canvas, o mais próximo possível do original. **Escopo: apenas ferramentas de
> edição de conteúdo.** Estão EXCLUÍDOS: efeitos, animações e transições.

## 1. Arquitetura geral da interface

O editor tem 4 regiões principais (não precisamos replicar exatamente os locais das regiões, podemos usar a base que já temos, isso é apenas para usar como exemplo e inspiração):

1. **Barra superior global** — Arquivo, Redimensionar, modo de Edição, desfazer/refazer (`Ctrl+Z` / `Ctrl+Shift+Z`), título do design, salvar automático, Compartilhar.
2. **Painel lateral esquerdo (abas)** — Modelos, Elementos, Texto, Marca, Uploads, Ferramentas, Projetos, Apps, Mídia Mágica. Ao clicar numa aba abre-se um painel deslizante com o conteúdo correspondente.
3. **Toolbar contextual (topo do canvas)** — muda dinamicamente conforme o tipo de elemento selecionado (texto, imagem, forma).
4. **Canvas central + navegador de páginas (miniaturas na base)** — múltiplas páginas, adicionar/duplicar página, zoom, visualização em grade.

Cada elemento selecionado exibe alças de redimensionamento (8 pontos: 4 cantos + 4 bordas) e uma alça de rotação, além de um mini-menu flutuante (Comentar, Bloquear, Duplicar, Excluir, Mais).

---

## 2. Edição de TEXTO

Toolbar exibida ao selecionar uma caixa de texto, da esquerda para a direita:

### 2.1 Fonte
- **Seletor de fonte**: botão que abre painel "Fonte" com duas abas:
  - **Fonte**: campo de busca, fontes do documento, kit de marca, lista de fontes populares (Arimo, Open Sans, Montserrat, Poppins, Anton, League Spartan, etc.), upload de fonte própria.
  - **Estilos de texto**: presets de estilo do documento — **Título**, **Subtítulo**, **Corpo**.

### 2.2 Tamanho da fonte
- Botão de diminuir (`–`), campo numérico editável, botão de aumentar (`+`). Valor em pt (ex.: 45,5).

### 2.3 Cor do texto
- Abre painel **"Cor do texto"** (ver seção 6 — sistema de cores, compartilhado com formas). Suporta **cor sólida** e **gradiente (degradê)**.

### 2.4 Formatação inline
- **Negrito** (`Ctrl+B`)
- **Itálico** (`Ctrl+I`)
- **Sublinhado** (`Ctrl+U`)
- **Tachado**
- **Maiúsculas** (alterna caixa-alta de todo o texto)

### 2.5 Alinhamento
- Botão cíclico/dropdown: à esquerda, centralizado, à direita, justificado.

### 2.6 Listas
- Marcadores / numeração.

### 2.7 Configurações avançadas (espaçamento e tipografia)
Painel "Configurações avançadas" com:
- **Espaçamento entre letras** (slider; intervalo negativo/positivo, ex.: -62)
- **Espaçamento entre linhas (Prioridade para implementação)** (slider, ex.: 0.82)
- **Ancorar caixa de texto**: topo / meio / base (alinhamento vertical do texto na caixa)
- **Formatação → Posição do texto**: normal, sobrescrito (A²), subscrito (A₂)
- **Tipografia → Kerning**: ajuste de espaçamento entre pares de letras (ligar/desligar)
- **Ligaduras**: combinar caracteres (ex.: "fi" → ﬁ)

### 2.8 Transparência
- Slider de opacidade (0–100%), aplicável ao elemento inteiro.

### Atalhos de texto
- `T` adiciona caixa de texto.

---

## 3. Edição de IMAGEM

Toolbar exibida ao selecionar uma imagem:
`Editar | Removedor de Fundo | Borracha | <swatches de cor/duotone> | Cortar | Inverter | Transparência | Posição`

### 3.1 Editar imagem (painel principal)
- **Selecionar área**: "Tudo" ou "Com clique" (seleção de região por clique para aplicar ajustes localizados).
- **Ferramentas**: Ajustar, Edição (camadas/mágica — IA, fora do escopo), Otimizar, Removedor de Fundo, Borracha, Gerador de Fundo.
  > As ferramentas baseadas em IA (Edição Mágica, Gerador de Fundo, Imagem a vídeo) ficam **fora do escopo**.
- **Cópia de estilo**: Nenhum / Recorte / Gravura (estilos artísticos pré-definidos).
- **Filtros**: presets (Natural, Quente, Frio, …) com intensidade ajustável.

### 3.2 Ajustar (sliders manuais) — núcleo da edição de imagem
- **Ajuste automático** (botão).
- **Balanço de brancos**: Temperatura, Matiz.
- **Iluminação**: Brilho, Contraste, Destaques, Sombras, Brancos, Pretos.
- **Cor**: toggle Inverter, Vibração, Saturação.
- **Edição de cores**: swatches por cor presente na imagem (ajuste seletivo de matiz/saturação por cor).
- **Textura**.
- Botão **Redefinir ajustes**.
- Todos os sliders têm campo numérico (default 0) e intervalo bipolar (negativo↔positivo).

### 3.3 Cortar (Crop)
- Abas **Cortar** / **Expandir**.
- **Corte Inteligente** (botão automático).
- **Proporção das dimensões**: Forma livre, Original, 1:1, e mais presets.
- **Girar**: slider de rotação + botão "Automático" + campo numérico (graus).
- Arraste das bordas para definir a área visível; a imagem se move dentro da moldura.

### 3.4 Inverter (Flip)
- Espelhar horizontal / vertical.

### 3.5 Borracha
- Apagar partes da imagem (máscara manual).

---

## 4. Edição de FORMAS / FIGURAS (Prioridade para implementação de forma funcional e eficiente)

### 4.1 Inserção (painel "Elementos" → "Formas")
Categorias disponíveis:
- **Linhas**: sólida, tracejada, pontilhada, com setas nas extremidades.
- **Formas básicas**: quadrado, quadrado arredondado, círculo, triângulo, etc.
- **Polígonos**: pentágono, hexágono, etc.
- **Estrelas**: variações de pontas.
- **Setas**: direcionais.

Atalhos: `R` retângulo, `C` círculo, `L` linha.

### 4.2 Toolbar da forma selecionada
`Editar | <Cor de preenchimento> | Estilo do traço | Cantos | Transparência | Posição`

- **Cor de preenchimento**: abre o painel de cores (seção 6). Sólida ou gradiente.
- **Estilo do traço (borda)**:
  - Estilo da linha: sem borda, sólida, tracejada, pontilhada, etc.
  - **Espessura do traço**: slider.
  - (cor da borda definida via painel de cor).
- **Cantos**:
  - **Arredondamento dos cantos**: slider (0 → máximo), border-radius.
  - **Lados**: nº de lados (apenas para polígonos).
- **Transparência**: opacidade do elemento.

---

## 5. Texto dentro de formas
- Uma forma pode receber texto interno (existe um "Editor de texto em Forma"). Ao digitar, o texto herda as mesmas propriedades da seção 2.

---

## 6. Sistema de CORES e DEGRADÊ (compartilhado por texto e formas)

Painel de cor unificado, com:

### 6.1 Topo
- Campo de busca por nome ("azul") ou hex ("#00c4cc").
- Botão **cor personalizada** (ícone arco-íris) → abre seletor com abas **Cor sólida** / **Gradiente**.
- **Conta-gotas** (eyedropper) — captura cor de qualquer ponto do design.

### 6.2 Listas de cores
- **Cores do/desse design**: cores já usadas no documento.
- **Kit de marca**: cores da marca + "Adicionar cores da marca".
- **Cores presentes na foto**: paleta extraída da imagem selecionada.
- **Cores sólidas padrão**: grade de cores padrão.

### 6.3 Cor sólida
- Seletor visual (área de matiz/saturação), barra de matiz, valor hex, opacidade.

### 6.4 Gradiente (Degradê)
- **Cores em gradiente**: lista de paradas (color stops) — adicionar/remover/editar cada cor.
- **Estilo**: direção/tipo do gradiente (vários presets de ângulo — linear em diferentes direções, radial).
- Cada parada usa o mesmo seletor de cor sólida.

---

## 7. POSIÇÃO, CAMADAS e ALINHAMENTO (todos os elementos)

Painel "Posição" com duas abas:

### 7.1 Organizar
- **Ordenação de camadas**: Para frente, Para trás, Para o topo, Para o fundo.
- **Alinhar à página**: Em cima, No meio, Embaixo, À esquerda, Ao centro, À direita.
- **Avançados**:
  - Largura, Altura (px) — com bloqueio de **Proporção** (cadeado).
  - Posição X, Y (px).
  - **Girar** (graus).

### 7.2 Camadas
- Lista de todas as camadas do design para seleção/reordenação direta.

### 7.3 Operações de elemento (mini-menu flutuante / atalhos)
- Duplicar (`Ctrl+D`), Bloquear, Excluir, Copiar estilo, Agrupar (`Ctrl+G`), Selecionar tudo (`Ctrl+A`).

---

## 8. Páginas
- Miniaturas na base; adicionar página, duplicar, reordenar, renomear.
- Zoom (campo de %), visualização em grade, tela cheia.

---

## 9. Requisitos de implementação sugeridos (para o Claude Code)
- Renderização em `<canvas>` ou SVG com modelo de cena baseado em camadas (z-index).
- Cada elemento = objeto com `{ type, x, y, width, height, rotation, opacity, ... }`.
- Texto: usar Web Fonts; suportar letter-spacing, line-height, vertical-anchor, sub/superscript.
- Imagem: aplicar ajustes via CSS filters / WebGL shaders (brightness, contrast, saturation, hue, temperature) + crop por máscara.
- Formas: SVG paths parametrizados (border-radius, stroke, stroke-dasharray, stroke-width, nº de lados).
- Cor: suportar `solid` e `linear/radial-gradient` com array de stops.
- Histórico undo/redo (command stack).
- **NÃO implementar**: efeitos visuais (sombras estilizadas, neon), animações, transições — fora do escopo.