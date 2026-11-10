# Finanças — app de gestão financeira pessoal

Next.js + TypeScript + Tailwind + Supabase. Funciona no computador e no celular (pode ser instalado como app).

## O que tem

- **Dashboard**: saldo disponível (com botão de ocultar), saldo consolidado (com investimentos), patrimônio líquido e previsão até o fim do mês. Resumo do período com receitas, despesas, resultado e a receber, cada um comparado ao período anterior e com o quanto já foi realizado. Previsão do saldo dia a dia, vencimentos (em atraso e próximos 7 dias, com botão de pagar), a pagar, vencidas, próximos 30 dias, dívidas, limite dos cartões e faturas em aberto. Gráficos de receitas x despesas, gastos por categoria, patrimônio, fluxo de caixa, evolução mensal e comparativo. Períodos: semana, mês, trimestre e ano.
- **Receitas e despesas**: categorias e subcategorias, conta, vencimento, pagamento, forma de pagamento, recorrência (semanal, quinzenal, mensal, anual), observações e situação (pago, pendente, atrasado, que é automático).
- **Cartões**: vários cartões, limite, fechamento, vencimento, melhor dia de compra, compras parceladas (cada parcela na fatura certa), faturas abertas, fechadas, vencidas e pagas, pagamento parcial de fatura e parcelas futuras.
- **Contas e carteiras**: corrente, poupança, carteira digital, dinheiro e investimentos, com extrato e saldo após cada movimento. Transferências não contam como receita nem como despesa.
- **Contas a pagar e a receber**: alertas de atraso, pagamento parcial, histórico e contas recorrentes.
- **Dívidas**: empréstimos e financiamentos (tabela Price), saldo devedor atualizado, parcelas pagas e pendentes, evolução e previsão de quitação. As parcelas viram contas a pagar.
- **Planejamento**: limite por categoria (alerta em 80%), reserva de emergência, metas, compras planejadas e projeção do saldo para 30, 90 ou 180 dias.
- **Relatórios**: resumo, categorias, cartões, fluxo de caixa, patrimônio, endividamento e recorrentes. Exporta em PDF e Excel.
- **Inteligência financeira**: análises feitas só com os seus dados, mais a ferramenta "Posso gastar R$ X hoje?".
- **Assistente**: chat em que você escreve gastos e ganhos como falaria ("gastei 45 no mercado ontem", "tênis 300 em 3x no cartão", "recebi 3000 de salário"). Ele identifica valor, categoria, data, conta ou cartão e parcelas, salva com um toque (com opção de desfazer) e responde "quanto gastei este mês?", "saldo", "posso gastar 200?" e "dicas". Funciona sem IA paga: as regras ficam em `lib/finance/assistant.ts` e rodam no aparelho.
- **Calendário financeiro** e **Simulador** (empréstimo Price/SAC, à vista x parcelado, antecipação de parcelas, impacto de nova despesa).
- **Importa** CSV/Excel (extratos), **exporta** Excel, e faz **backup e restauração**.
- Login com e-mail e senha. Cada pessoa só vê os próprios dados (RLS no banco). Tem modo claro e escuro.

### Como o dinheiro é contado (para não duplicar)
- Compra no cartão conta como **despesa** na data da compra (parcela 1) e as demais parcelas uma por mês.
- O **pagamento da fatura** só tira o dinheiro da conta. Não é outra despesa.
- **Transferência** entre suas contas não é receita nem despesa.
- Todos os valores são guardados em centavos (sem erro de arredondamento).
- **Saldo disponível** = contas ativas, menos as de investimento, na data de hoje. **Saldo consolidado** = disponível + investimentos. **Patrimônio líquido** = tudo o que há nas contas (inclusive arquivadas) − faturas de cartão em aberto − saldo devedor dos empréstimos.
- **Previsão do fim do mês**: parte do saldo disponível de hoje e soma o que está pendente até lá (contas a pagar e a receber, faturas e lançamentos já marcados como pagos com data futura). Pendências atrasadas entram como se fossem quitadas hoje.
- **Comparativos**: sem lançamentos no período anterior, o painel diz isso em vez de mostrar uma porcentagem.

---

## Colocar no ar (cerca de 20 minutos, tudo grátis)

Você vai precisar de três contas gratuitas: **Supabase** (banco e login), **GitHub** (guarda o código) e **Vercel** (publica o site).

### 1. Supabase: criar o banco
1. Entre em https://supabase.com e clique em **New project**. Dê um nome, crie uma senha do banco (guarde-a) e escolha a região **South America (São Paulo)**.
2. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
3. Abra o arquivo `supabase/schema.sql` deste projeto no Bloco de Notas, copie tudo, cole no SQL Editor e clique em **Run**. Deve aparecer "Success".
4. Abra **Project Settings → API** (ou o botão **Connect**) e copie:
   - **Project URL**: algo como `https://abcd1234.supabase.co`
   - **Publishable key**: começa com `sb_publishable_`. Em projetos antigos ela aparece como **anon public**.

### 2. GitHub: enviar o código
1. Entre em https://github.com e crie um repositório **privado** (**New repository**), por exemplo `financas`.
2. Na página do repositório vazio, clique em **uploading an existing file**.
3. Arraste **o conteúdo** da pasta `financas-app` (as pastas `app`, `components`, `lib` etc. e os arquivos soltos, não a pasta em si) e clique em **Commit changes**.

### 3. Vercel: publicar
1. Entre em https://vercel.com com a conta do GitHub e clique em **Add New → Project**. Escolha o repositório `financas`.
2. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL` = a Project URL do passo 1
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = a Publishable key do passo 1
3. Clique em **Deploy**. Em 1 ou 2 minutos você recebe um endereço, como `https://financas-xyz.vercel.app`.

### 4. Supabase: liberar o endereço do site
Em **Authentication → URL Configuration**:
- **Site URL**: o endereço da Vercel
- **Redirect URLs**: adicione `https://SEU-ENDERECO.vercel.app/**`

Sem isso, os links de confirmação de e-mail e de recuperação de senha não funcionam.

### 5. Usar
Abra o endereço, clique em **Criar conta**, confirme o e-mail e pronto. Comece cadastrando as contas, depois os cartões e por fim as receitas e despesas.

**No celular (Android/Chrome):** abra o site, toque no menu ⋮ e depois em **Instalar app** (ou "Adicionar à tela inicial"). **No iPhone (Safari):** botão compartilhar → **Adicionar à Tela de Início**.

---

## Dicas
- **Backup:** em Configurações → Fazer backup, de vez em quando. O Supabase grátis pausa projetos sem uso por 7 dias. Os dados não se perdem, é só entrar no painel do Supabase e clicar em "Restore".
- **Importar extrato:** em Configurações → Importar CSV ou Excel. O app reconhece as colunas de data, descrição e valor, e desmarca as linhas que parecem já cadastradas.
- **E-mails de confirmação:** o Supabase grátis envia poucos e-mails por hora. Se quiser, desligue a confirmação em Authentication → Sign In / Providers → Email → "Confirm email".

## Para desenvolvedores
```bash
npm install
cp .env.example .env.local   # preencha os dois valores
npm run dev                  # http://localhost:3000
npm test                     # testes das regras financeiras
```
- `supabase/schema.sql`: tabelas, RLS, funções (compra parcelada, empréstimo, pagamento parcial, restauração de backup). Pode rodar de novo sem perder dados.
- `supabase/test/`: testes de segurança e regras do banco (Postgres local).
- `lib/finance/`: regras de negócio puras (cartões, saldos, empréstimos, relatórios, projeções, análises), testadas em `tests/`.
- `lib/store.tsx`: carrega os dados do usuário e faz as operações. `components/forms/`: formulários com validação (zod).

## Identidade visual (design system)

Visual de fintech: base preta (cerca de 80% da tela) e verde-limão como assinatura (cerca de 20%: ações principais, itens selecionados, valores positivos e gráficos). O tema escuro é o padrão. O claro e o automático continuam em Configurações › Aparência.

| Papel | Cor |
|---|---|
| Verde-limão (marca, ações, positivo) | `#B7F000` |
| Preto profundo (fundo) | `#080A08` |
| Preto secundário (cartões) | `#111411` |
| Cinza escuro (bordas, realces) | `#1B201B` |
| Cinza médio (texto secundário) | `#858B84` |
| Branco suave (fundo no tema claro) | `#F5F7F2` |

- **Tokens** em `app/globals.css` (`@theme`): escalas `brand` (limão), `navy` (grafite das superfícies), `slate` (cinzas de texto), `emerald` (positivo = limão), `rose` (negativo), `violet` (cartões de crédito, menta discreta), raios, sombras e animações. Os gráficos usam variáveis `--chart-*`, que mudam com o tema.
- **Componentes** em `components/ui.tsx`: botões (primário limão com texto preto, secundário, fantasma, perigo), cartões arredondados com sombra suave, campos com foco em limão, seletores segmentados, interruptores, selos, barras de progresso, estados vazios e de carregamento.
- **Ícones**: só Lucide, traço de 1,9 a 2,2. Cada categoria tem ícone próprio (`components/category-icon.tsx`) no estilo duotone, com a cor da categoria.
- **Navegação**: menu lateral agrupado por contexto (Visão geral, Movimentações, Contas e cartões, Planejamento, Análises). No celular há a barra inferior com o botão de ação rápida e uma folha "Mais" com os mesmos grupos.
- **Responsivo**: sem rolagem lateral de 360 px até telas largas. Os itens de grade podem encolher (`.grid > * { min-width: 0 }`) e os menus perto do rodapé abrem para cima.
