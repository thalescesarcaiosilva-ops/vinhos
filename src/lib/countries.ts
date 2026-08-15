export type CountryInfo = {
  slug: string;
  label: string;
  cc: string; // ISO country code for flagcdn
  trivia: string;
};

export const countries: CountryInfo[] = [
  {
    slug: "africa-do-sul",
    label: "África do Sul",
    cc: "za",
    trivia:
      "A África do Sul é a maior produtora de vinhos do continente africano. A região de Stellenbosch, próxima à Cidade do Cabo, produz alguns dos melhores Chenin Blancs e Pinotages do mundo — uva nascida no país em 1925.",
  },
  {
    slug: "alemanha",
    label: "Alemanha",
    cc: "de",
    trivia:
      "A Alemanha é reconhecida mundialmente por seus Rieslings, considerados os mais elegantes do planeta. As regiões do Mosel e do Reno cultivam vinhedos em encostas íngremes às margens dos rios, criando vinhos brancos de acidez vibrante.",
  },
  {
    slug: "argentina",
    label: "Argentina",
    cc: "ar",
    trivia:
      "A Argentina é o maior produtor de vinhos da América do Sul, com Mendoza como sua principal região. O Malbec, originário da França, encontrou na altitude dos Andes o terroir perfeito para se tornar a uva símbolo do país.",
  },
  {
    slug: "australia",
    label: "Austrália",
    cc: "au",
    trivia:
      "A Austrália é famosa por seus Shiraz potentes e encorpados, especialmente os do Barossa Valley. O país tem algumas das videiras mais antigas do mundo, com algumas plantas ultrapassando 150 anos de idade.",
  },
  {
    slug: "austria",
    label: "Áustria",
    cc: "at",
    trivia:
      "A Áustria é mundialmente reconhecida pelo Grüner Veltliner, uva branca emblemática do país. As regiões do Wachau e Kamptal produzem vinhos elegantes e minerais, com forte tradição vitivinícola desde a época romana.",
  },
  {
    slug: "brasil",
    label: "Brasil",
    cc: "br",
    trivia:
      "O Brasil é referência mundial em vinhos espumantes, especialmente os produzidos na Serra Gaúcha pelo método Charmat. O Vale dos Vinhedos foi a primeira região do país a receber Indicação de Procedência.",
  },
  {
    slug: "bulgaria",
    label: "Bulgária",
    cc: "bg",
    trivia:
      "A Bulgária tem uma das tradições vinícolas mais antigas do mundo, com mais de 3 mil anos de história. As uvas autóctones Mavrud e Melnik produzem tintos encorpados e cheios de personalidade.",
  },
  {
    slug: "canada",
    label: "Canadá",
    cc: "ca",
    trivia:
      "O Canadá é mundialmente famoso pelo Ice Wine (vinho do gelo), produzido com uvas colhidas congeladas. A região de Niagara, em Ontário, é a principal produtora desse vinho doce e concentrado.",
  },
  {
    slug: "chile",
    label: "Chile",
    cc: "cl",
    trivia:
      "O Chile é um dos poucos países do mundo livres da praga da filoxera, permitindo que suas videiras cresçam em raízes originais. A Carménère, uva considerada extinta na França, foi redescoberta aqui e tornou-se símbolo nacional.",
  },
  {
    slug: "escocia",
    label: "Escócia",
    cc: "gb-sct",
    trivia:
      "A Escócia é a terra do whisky por excelência. As destilarias das regiões de Speyside, Islay e Highlands produzem alguns dos destilados mais cobiçados do mundo, com tradição de mais de 500 anos.",
  },
  {
    slug: "eslovenia",
    label: "Eslovênia",
    cc: "si",
    trivia:
      "A Eslovênia é a terra dos chamados vinhos laranjas (orange wines), elaborados com maceração prolongada de uvas brancas. A região do Brda, na fronteira com a Itália, produz alguns dos mais prestigiados do estilo.",
  },
  {
    slug: "espanha",
    label: "Espanha",
    cc: "es",
    trivia:
      "A Espanha possui a maior área plantada de vinhedos do mundo. Regiões como Rioja e Ribera del Duero produzem tintos elegantes com a uva Tempranillo, enquanto o Cava é a resposta espanhola aos espumantes de qualidade.",
  },
  {
    slug: "eua",
    label: "Estados Unidos",
    cc: "us",
    trivia:
      "Os Estados Unidos são o quarto maior produtor de vinhos do mundo, com a Califórnia respondendo por quase 90% da produção nacional. O Napa Valley se consagrou após o histórico Julgamento de Paris de 1976.",
  },
  {
    slug: "franca",
    label: "França",
    cc: "fr",
    trivia:
      "A França é o berço de regiões lendárias como Bordeaux, Borgonha e Champagne. O conceito de terroir nasceu aqui, e o país é referência mundial em técnicas de vinificação e envelhecimento em barricas de carvalho.",
  },
  {
    slug: "grecia",
    label: "Grécia",
    cc: "gr",
    trivia:
      "A Grécia é o berço do vinho ocidental, com tradição de mais de 6 mil anos. Uvas autóctones como Assyrtiko (de Santorini) e Agiorgitiko produzem vinhos únicos, reflexo do terroir vulcânico e mediterrâneo.",
  },
  {
    slug: "hungria",
    label: "Hungria",
    cc: "hu",
    trivia:
      "A Hungria é famosa pelo Tokaji, vinho doce histórico chamado por Luís XIV de \u201Crei dos vinhos, vinho dos reis\u201D. A região do Tokaj foi a primeira do mundo a classificar oficialmente seus vinhedos, em 1737.",
  },
  {
    slug: "inglaterra",
    label: "Inglaterra",
    cc: "gb-eng",
    trivia:
      "A Inglaterra vem ganhando destaque mundial por seus espumantes pelo método tradicional, especialmente os do Sussex e Kent, cujo solo calcário lembra o de Champagne.",
  },
  {
    slug: "irlanda",
    label: "Irlanda",
    cc: "ie",
    trivia:
      "A Irlanda é mundialmente conhecida por seus whiskeys triple-distilled, mais suaves e leves. Destilarias como Jameson e Bushmills mantêm uma tradição centenária de qualidade.",
  },
  {
    slug: "israel",
    label: "Israel",
    cc: "il",
    trivia:
      "Israel produz vinhos há mais de 5 mil anos, mas vive um renascimento moderno desde os anos 1980. As regiões da Galileia e dos Montes Golã se destacam pela alta qualidade e por vinhos kosher reconhecidos internacionalmente.",
  },
  {
    slug: "italia",
    label: "Itália",
    cc: "it",
    trivia:
      "A Itália é o maior produtor mundial de vinhos, com mais de 350 variedades de uvas registradas. Toscana, Piemonte e Vêneto produzem clássicos como Chianti, Barolo e Prosecco, reconhecidos no mundo todo.",
  },
  {
    slug: "libano",
    label: "Líbano",
    cc: "lb",
    trivia:
      "O Líbano produz vinhos há mais de 5 mil anos. O Vale do Bekaa, região vitivinícola principal do país, abriga vinícolas históricas como Château Musar, reconhecida mundialmente pela longevidade de seus tintos.",
  },
  {
    slug: "macedonia-do-norte",
    label: "Macedônia do Norte",
    cc: "mk",
    trivia:
      "A Macedônia do Norte tem uma das mais antigas culturas vinícolas dos Bálcãs. A uva Vranec produz tintos profundos e aromáticos que são a marca registrada da viticultura do país.",
  },
  {
    slug: "marrocos",
    label: "Marrocos",
    cc: "ma",
    trivia:
      "O Marrocos é o maior produtor de vinhos do mundo árabe. A viticultura no país tem influência francesa marcante, e o clima mediterrâneo das regiões de Meknès e Benslimane favorece tintos encorpados.",
  },
  {
    slug: "mexico",
    label: "México",
    cc: "mx",
    trivia:
      "O México foi o primeiro país do continente americano a produzir vinhos, com videiras introduzidas pelos espanhóis no século XVI. O Valle de Guadalupe, na Baixa Califórnia, é hoje a principal região produtora.",
  },
  {
    slug: "moldavia",
    label: "Moldávia",
    cc: "md",
    trivia:
      "A Moldávia abriga a Mileștii Mici, a maior adega do mundo segundo o Guinness, com mais de 200 km de galerias subterrâneas. O país produz vinhos há mais de 5 mil anos e tem o vinho como parte de sua identidade nacional.",
  },
  {
    slug: "noruega",
    label: "Noruega",
    cc: "no",
    trivia:
      "A Noruega se destaca pelo aquavit, destilado tradicional escandinavo aromatizado com carvi ou endro, frequentemente envelhecido em barris durante travessias marítimas pelo Equador.",
  },
  {
    slug: "nova-zelandia",
    label: "Nova Zelândia",
    cc: "nz",
    trivia:
      "A Nova Zelândia se tornou referência mundial em Sauvignon Blanc, especialmente os da região de Marlborough, com aromas exuberantes de frutas tropicais e maracujá. O país também produz Pinot Noirs de altíssima qualidade.",
  },
  {
    slug: "peru",
    label: "Peru",
    cc: "pe",
    trivia:
      "O Peru tem tradição vinícola desde o século XVI, sendo um dos primeiros países da América do Sul a produzir vinhos. É também o berço do Pisco, destilado de uvas reconhecido como bebida nacional.",
  },
  {
    slug: "portugal",
    label: "Portugal",
    cc: "pt",
    trivia:
      "Portugal é famoso por seu Vinho do Porto, um vinho fortificado produzido na região do Douro. Essa bebida é conhecida por sua riqueza e doçura, e sua produção é regulamentada, com as uvas sendo colhidas à mão nas encostas íngremes do vale.",
  },
  {
    slug: "romenia",
    label: "Romênia",
    cc: "ro",
    trivia:
      "A Romênia é um dos maiores produtores de vinho da Europa, com tradição vinícola de mais de 6 mil anos. As regiões de Cotnari e Murfatlar produzem brancos doces e aromáticos premiados internacionalmente.",
  },
  {
    slug: "suecia",
    label: "Suécia",
    cc: "se",
    trivia:
      "A Suécia tem uma rica tradição em destilados, com destaque para a vodka e o aquavit, e mais recentemente vem se destacando também na produção de whiskies de qualidade.",
  },
  {
    slug: "uruguai",
    label: "Uruguai",
    cc: "uy",
    trivia:
      "O Uruguai é conhecido pela uva Tannat, que encontrou no clima atlântico do país sua melhor expressão. Os vinhos uruguaios são marcados por taninos firmes e excelente capacidade de guarda.",
  },
];

export const countryMap: Record<string, CountryInfo> = Object.fromEntries(
  countries.map((c) => [c.slug, c])
);

export function getCountry(slug: string): CountryInfo | undefined {
  return countryMap[slug];
}
