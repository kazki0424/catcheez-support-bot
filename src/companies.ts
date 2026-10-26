// 企業・銘柄の説明(日本語)。「ソフトバンクってどんな会社?」に答える辞書です。
// ここに無い企業は、ANTHROPIC_API_KEY があれば AI が答えます。数字は古くなりやすいので、事業内容・本社・上場先など変わりにくい事実だけ書いています。
import { ALIASES } from './prices.js';

export interface Company { name: string; desc: string; match?: string[]; syms?: string[] }
// キー = 銘柄コード(CATCHEEZの表記)。syms = 同じ会社の別コード、match = 文章から拾う語
export const COMPANIES: Record<string, Company> = {
  // ---- 日本 ----
  SOFTBANK: { name: 'ソフトバンクグループ（9984）', match: ['ソフトバンク', 'softbank', '9984', '孫正義'],
    desc: '日本の投資持株会社。孫正義氏が1981年に創業。携帯電話会社のソフトバンク（9434）、半導体設計のArm、ビジョン・ファンドを通じたAI・テック企業への投資を主な事業とし、近年はOpenAIへの大型出資でも知られる。東証プライム上場。' },
  TOYOTA: { name: 'トヨタ自動車（7203）', syms: ['TM', '7203'], match: ['トヨタ', 'toyota', '7203'],
    desc: '愛知県豊田市に本社を置く世界最大級の自動車メーカー。1937年創業。ハイブリッド車「プリウス」で知られ、レクサスブランドも展開。販売台数は世界首位級。東証プライムとニューヨーク証券取引所に上場。' },
  SONY: { name: 'ソニーグループ（6758）', syms: ['6758'], match: ['ソニー', 'sony', '6758'],
    desc: '東京に本社を置く総合エンタメ・エレクトロニクス企業。1946年創業。ゲーム（PlayStation）、音楽、映画、イメージセンサー、金融を手がけ、現在はゲームと音楽・映画が利益の柱。東証プライムとNYSEに上場。' },
  KIOXIA: { name: 'キオクシアホールディングス（285A）', match: ['キオクシア', 'kioxia', '285a', '東芝メモリ'],
    desc: '旧・東芝メモリ。NAND型フラッシュメモリを発明した東芝のメモリ部門が2018年に独立した会社で、本社は東京。スマホ・PC・データセンター向けのフラッシュメモリとSSDを製造し、四日市（三重）と北上（岩手）に大型工場を持つ。2024年12月に東証プライムへ上場。' },
  MUFG: { name: '三菱UFJフィナンシャル・グループ（8306）', syms: ['8306'], match: ['三菱ufj', 'mufg', '8306', '三菱東京'],
    desc: '日本最大の金融グループ。三菱UFJ銀行、三菱UFJ信託銀行、三菱UFJモルガン・スタンレー証券などを傘下に持つ。米モルガン・スタンレーの大株主でもある。東証プライムとNYSEに上場。' },
  NINTENDO: { name: '任天堂（7974）', syms: ['7974'], match: ['任天堂', 'nintendo', '7974'],
    desc: '京都に本社を置くゲーム機・ゲームソフトの会社。1889年に花札の製造で創業。Nintendo Switchとその後継機、マリオ・ゼルダ・ポケモンなどの自社IPで知られる。東証プライム上場。' },
  FASTRETAIL: { name: 'ファーストリテイリング（9983）', syms: ['9983'], match: ['ファーストリテイリング', 'ユニクロ', 'uniqlo', '9983'],
    desc: '「ユニクロ」「GU」を展開するアパレル企業。山口県発祥で、柳井正氏が率いる。世界で店舗を展開し、日経平均株価への影響が最も大きい銘柄の一つ。東証プライム上場。' },
  TEL: { name: '東京エレクトロン（8035）', syms: ['8035'], match: ['東京エレクトロン', 'tokyo electron', '8035'],
    desc: '半導体製造装置の大手。成膜・エッチング・洗浄などの装置で世界トップクラスのシェアを持ち、TSMC・サムスン・インテルなどが顧客。本社は東京。東証プライム上場。' },
  ADVANTEST: { name: 'アドバンテスト（6857）', syms: ['6857'], match: ['アドバンテスト', 'advantest', '6857'],
    desc: '半導体の検査装置（テスター）で世界首位級。AI向け高性能チップやHBMメモリの検査需要で注目される。本社は東京。東証プライム上場。' },
  HITACHI: { name: '日立製作所（6501）', syms: ['6501'], match: ['日立', 'hitachi', '6501'],
    desc: '日本を代表する総合電機メーカー。現在は発電・送配電などのエネルギー、鉄道、ITサービス「Lumada」を柱とする。本社は東京。東証プライム上場。' },
  MHI: { name: '三菱重工業（7011）', syms: ['7011'], match: ['三菱重工', 'mhi', '7011'],
    desc: '発電プラント、航空・防衛、造船、宇宙（H3ロケット）などを手がける重工業の大手。防衛関連の受注拡大で注目されることが多い。本社は東京。東証プライム上場。' },
  // ---- 米国 ----
  NVDA: { name: 'NVIDIA（エヌビディア）', match: ['nvidia', 'エヌビディア'],
    desc: '米カリフォルニア州サンタクララのGPU（画像処理半導体）メーカー。1993年創業、CEOはジェンスン・フアン氏。ゲーム向けGPUで成長し、現在はAIの学習・推論に使われるデータセンター向けGPUが主力で、世界で最も時価総額の大きい企業の一つ。NASDAQ上場。' },
  TSLA: { name: 'Tesla（テスラ）', match: ['tesla', 'テスラ'],
    desc: 'イーロン・マスク氏がCEOを務める電気自動車（EV）メーカー。本社は米テキサス州オースティン。Model 3/Yなどの車に加え、蓄電池・太陽光、自動運転ソフト、人型ロボット「Optimus」も開発。NASDAQ上場。' },
  AAPL: { name: 'Apple（アップル）', match: ['apple', 'アップル'],
    desc: 'iPhone・Mac・iPad・Apple Watchなどを手がける米カリフォルニア州クパチーノの企業。1976年創業。ハードに加え、App Store・iCloud・Apple Musicなどのサービス収入が拡大している。NASDAQ上場。' },
  MSFT: { name: 'Microsoft（マイクロソフト）', match: ['microsoft', 'マイクロソフト'],
    desc: 'WindowsとOfficeで知られる米ワシントン州レドモンドのソフトウェア企業。現在はクラウド「Azure」が成長の柱で、OpenAIへの大型出資とCopilotなどAI製品でも知られる。ゲーム（Xbox）、LinkedIn、GitHubも傘下。NASDAQ上場。' },
  AMZN: { name: 'Amazon（アマゾン）', match: ['amazon', 'アマゾン'],
    desc: '世界最大のネット通販企業で、本社は米シアトル。利益の多くはクラウド事業「AWS」が稼ぐ。広告、プライム会員サービス、物流も大きな事業。NASDAQ上場。' },
  GOOGL: { name: 'Alphabet（アルファベット / Google）', syms: ['GOOG'], match: ['google', 'グーグル', 'alphabet', 'アルファベット'],
    desc: 'Googleの親会社。検索・YouTube・Android・Google Cloudを運営し、収益の中心はネット広告。自社開発のAIモデル「Gemini」や自動運転のWaymoも傘下。本社は米カリフォルニア州マウンテンビュー。NASDAQ上場。' },
  META: { name: 'Meta Platforms（メタ）', match: ['facebook', 'フェイスブック', 'instagram', 'インスタ'],
    desc: 'Facebook・Instagram・WhatsApp・Threadsを運営する米カリフォルニア州メンローパークの企業。収益のほぼすべてが広告。AIへの大型投資と、VR/ARの「Reality Labs」でも知られる。NASDAQ上場。' },
  PLTR: { name: 'Palantir（パランティア）', match: ['palantir', 'パランティア'],
    desc: '政府・軍・企業向けのデータ分析ソフトを提供する米企業。2003年創業、本社はコロラド州デンバー。米国防総省やCIAが顧客で、企業向けのAIプラットフォーム「AIP」が急成長している。NASDAQ上場。' },
  COST: { name: 'Costco（コストコ）', match: ['costco', 'コストコ'],
    desc: '会員制の倉庫型スーパーを世界で運営する米企業。本社はワシントン州。年会費が利益の柱で、商品は薄利で販売する独自のモデル。日本にも店舗がある。NASDAQ上場。' },
  HOOD: { name: 'Robinhood（ロビンフッド）', match: ['robinhood', 'ロビンフッド'],
    desc: '手数料無料の株取引アプリで知られる米国のネット証券。2013年創業。株・オプション・暗号資産を扱い、若い個人投資家に人気。NASDAQ上場。' },
  COIN: { name: 'Coinbase（コインベース）', match: ['coinbase', 'コインベース'],
    desc: '米国最大の暗号資産取引所。2012年創業。個人向け取引に加え、機関投資家向けのカストディ（保管）や、イーサリアム上のL2「Base」も運営。NASDAQ上場。' },
  MSTR: { name: 'Strategy（旧MicroStrategy）', match: ['microstrategy', 'マイクロストラテジー', 'strategy', 'セイラー'],
    desc: 'もともとはデータ分析ソフトの会社だったが、2020年からビットコインを大量に買い続け、世界最大のビットコイン保有企業になった。株価はビットコイン価格に強く連動する。本社は米バージニア州。NASDAQ上場。' },
  AMD: { name: 'AMD', match: ['amd', 'エーエムディー'],
    desc: 'CPU「Ryzen」「EPYC」とGPU「Radeon」「Instinct」を手がける米半導体メーカー。インテルやNVIDIAと競合し、AI向けGPUでNVIDIAを追う。本社はカリフォルニア州サンタクララ。NASDAQ上場。' },
  INTC: { name: 'Intel（インテル）', match: ['intel', 'インテル'],
    desc: 'PC・サーバー向けCPUの老舗メーカー。近年はTSMCやAMDに押され、製造（ファウンドリ）事業の立て直しが課題で、米政府の出資も受けた。本社は米カリフォルニア州サンタクララ。NASDAQ上場。' },
  MU: { name: 'Micron（マイクロン）', match: ['micron', 'マイクロン'],
    desc: '米国唯一の大手メモリメーカー。DRAMとNANDフラッシュを製造し、AIサーバー向けHBMにも参入。日本の広島に主力工場を持つ。本社はアイダホ州ボイシ。NASDAQ上場。' },
  TSM: { name: 'TSMC（台湾積体電路製造）', match: ['tsmc', 'ティーエスエムシー', '台湾セミ'],
    desc: '世界最大の半導体受託製造（ファウンドリ）企業。Apple、NVIDIA、AMDなどのチップを製造し、最先端プロセスでほぼ独占的な地位。本社は台湾・新竹で、熊本やアリゾナにも工場。NYSEにADR上場。' },
  ASML: { name: 'ASML', match: ['asml'],
    desc: 'オランダの半導体製造装置メーカー。最先端チップに必須のEUV（極端紫外線）露光装置を世界で唯一製造している。NASDAQとユーロネクスト・アムステルダムに上場。' },
  AVGO: { name: 'Broadcom（ブロードコム）', match: ['broadcom', 'ブロードコム'],
    desc: '通信・データセンター向け半導体とソフトウェアの大手。Google など大手向けのAIカスタムチップ（ASIC）で注目され、VMwareも買収した。本社は米カリフォルニア州パロアルト。NASDAQ上場。' },
  NFLX: { name: 'Netflix（ネットフリックス）', match: ['netflix', 'ネットフリックス'],
    desc: '世界最大の動画配信サービス。1997年にDVDレンタルで創業し、現在は会員向けのオリジナル作品制作と広告付きプランで成長。本社は米カリフォルニア州ロスガトス。NASDAQ上場。' },
  ORCL: { name: 'Oracle（オラクル）', match: ['oracle', 'オラクル'],
    desc: 'データベースソフトの老舗で、近年はAI向けのクラウドインフラ（OCI）が急成長。OpenAIなどへの大規模なデータセンター提供で知られる。本社は米テキサス州オースティン。NYSE上場。' },
  NBIS: { name: 'Nebius（ネビウス）', match: ['nebius', 'ネビウス'],
    desc: 'AI向けクラウド（GPUの貸し出し）を提供するオランダ・アムステルダムの企業。ロシアのYandexの海外事業が分離してできた会社で、MicrosoftやMetaと大型契約を結んだ。NASDAQ上場。' },
  CRCL: { name: 'Circle（サークル）', match: ['circle', 'サークル', 'usdc発行'],
    desc: 'ステーブルコイン「USDC」を発行する米企業。2013年創業。USDCの裏付け資産（米国債など）の利息が主な収益。2025年6月にNYSEに上場した。' },
  SOXL: { name: 'SOXL（半導体3倍ブルETF）', match: ['soxl', 'ソクル'],
    desc: '米国の半導体株指数（ICE Semiconductor Index）の日々の値動きの3倍を目指すレバレッジETF。Direxion社が運用。値動きが非常に大きく、長期保有には向かないとされる。' },
  EWY: { name: 'EWY（iShares MSCI 韓国ETF）', match: ['ewy', '韓国etf'],
    desc: '韓国株全体に投資できる米国上場ETF。サムスン電子、SKハイニックス、現代自動車などが主な組み入れ銘柄。BlackRock（iShares）が運用。' },
  // ---- 未上場・そのほか ----
  SPCX: { name: 'SpaceX（スペースX）', syms: ['SPACEX'], match: ['spacex', 'スペースx', 'スペースエックス', 'スターリンク', 'starlink'],
    desc: 'イーロン・マスク氏が2002年に創業した米国の宇宙開発企業。再使用ロケット「Falcon 9」、巨大ロケット「Starship」、衛星インターネット「Starlink」を手がける。未上場で、CATCHEEZでは未上場株の評価額に連動する価格を取引する。' },
  OPENAI: { name: 'OpenAI（オープンAI）', syms: ['OAI'], match: ['openai', 'オープンai', 'chatgpt', 'チャットgpt'],
    desc: 'ChatGPTを開発する米サンフランシスコのAI企業。2015年に非営利として設立。Microsoftとソフトバンクグループが大株主。未上場で、CATCHEEZでは未上場株の評価額に連動する価格を取引する。' },
  ANTHROPIC: { name: 'Anthropic（アンソロピック）', syms: ['ANTH', 'ANT'], match: ['anthropic', 'アンソロピック', 'claude', 'anth'],
    desc: 'AIモデル「Claude」を開発する米サンフランシスコのAI企業。2021年に元OpenAIのメンバーが設立。AmazonとGoogleが大株主。2026年10月にナスダック上場に向けたS-1を公開し、予定ティッカーは「ANT」。\n\nCATCHEEZには2つの市場があります。<b>ANTH</b>（Entropy市場、8月から。価格は1株あたり約$1,900前後の基準）と <b>ANT</b>（trade.xyz市場、S-1公開後に追加。約$110前後の基準）。基準の株数が違うので価格の数字は比べられません。変化率（%）で見てください。どちらも株そのものではなく、上場前の評価額に連動する先物です。' },
  UNITREE: { name: 'Unitree Robotics（宇樹科技）', match: ['unitree', 'ユニツリー', '宇樹'],
    desc: '中国・杭州のロボットメーカー。2016年創業。四足歩行ロボット「Go2」や人型ロボット「G1」「H1」を比較的安価に販売し、中国のヒューマノイド企業の代表格。上海市場への上場準備中とされる。' },
  SKHY: { name: 'SK hynix（SKハイニックス）', syms: ['SKHX', '000660'], match: ['ハイニックス', 'hynix', 'skハイニックス'],
    desc: '韓国のメモリ半導体メーカーで、サムスン電子に次ぐ世界2位。AI向けの高帯域メモリ「HBM」で先行し、NVIDIAの主要供給元。本社は京畿道利川。韓国取引所（KOSPI）上場。' },
  SMSN: { name: 'Samsung Electronics（サムスン電子）', syms: ['SAMSUNG', '005930'], match: ['サムスン', 'samsung', '005930'],
    desc: '韓国最大の企業。メモリ半導体で世界首位、スマートフォン「Galaxy」、テレビ・家電、半導体受託製造も手がける。本社は京畿道水原。韓国取引所（KOSPI）上場。' },
  JIO: { name: 'Jio Platforms（ジオ・プラットフォームズ）', match: ['jio', 'ジオプラットフォーム', 'リライアンス', 'reliance'],
    desc: 'インド最大の財閥リライアンス・インダストリーズのデジタル・通信子会社。携帯通信「Jio」はインド最大の契約者数を持つ。Google・Metaが出資。上場準備中とされる。' },
  // ---- 指数・商品・為替・暗号資産 ----
  JP225: { name: '日経225（日経平均株価）', match: ['日経', 'nikkei', '日経平均'],
    desc: '東京証券取引所プライム市場の代表的な225銘柄から算出する株価指数。ファーストリテイリング、東京エレクトロン、ソフトバンクグループなど株価の高い銘柄の影響が大きい。日本株全体の動きを見る代表的な指標。' },
  KR200: { name: 'KOSPI 200（韓国株指数）', match: ['kospi', 'コスピ', '韓国株'],
    desc: '韓国取引所の主要200銘柄で構成する株価指数。サムスン電子とSKハイニックスの比重が大きく、半導体の景気に左右されやすい。' },
  SP500: { name: 'S&P 500', match: ['s&p', 'sp500', 'エスアンドピー'],
    desc: '米国の主要500社で構成する株価指数。米国株全体の動きを表す最も代表的な指標で、Apple・NVIDIA・Microsoftなど大型テック株の比重が高い。' },
  XYZ100: { name: 'XYZ100（米国テック100）', match: ['xyz100', 'ナスダック', 'nasdaq', '米国100'],
    desc: '米国の大型テック株100銘柄に連動する指数。NASDAQ 100に近い構成で、NVIDIA・Apple・Microsoft・Amazonなどが中心。' },
  GOLD: { name: '金（ゴールド）', match: ['ゴールド', 'gold'],
    desc: '代表的な実物資産。インフレや戦争・金融不安のときに買われやすく「安全資産」と呼ばれる。価格は1トロイオンス（約31.1g）あたりの米ドルで表示。各国の中央銀行の買いが近年の上昇要因とされる。' },
  SILVER: { name: '銀（シルバー）', match: ['シルバー', 'silver'],
    desc: '貴金属であると同時に、太陽光パネルや電子機器に使われる工業用金属。金より値動きが大きい傾向がある。価格は1トロイオンスあたりの米ドル。' },
  COPPER: { name: '銅', match: ['銅', 'copper', 'カッパー'],
    desc: '電線・モーター・データセンターなどに使われる工業用金属。景気やEV・電力投資の動向で価格が動くため「ドクター・カッパー」と呼ばれる。' },
  CL: { name: 'WTI原油', syms: ['WTI'], match: ['原油', 'wti', 'オイル'],
    desc: '米国産の原油価格の指標（ウエスト・テキサス・インターミディエート）。価格は1バレルあたりの米ドル。OPEC+の生産方針、米国の在庫、中東情勢で動く。' },
  BRENTOIL: { name: 'ブレント原油', syms: ['BRENT'], match: ['ブレント', 'brent'],
    desc: '北海産の原油価格で、世界の原油取引の基準になる指標。WTIより少し高い水準で推移することが多い。価格は1バレルあたりの米ドル。' },
  JPY: { name: 'ドル円（USD/JPY）', syms: ['USDJPY'], match: ['ドル円', 'usdjpy'],
    desc: '米ドルと日本円の為替レート。日米の金利差で動きやすく、日銀と米FRBの政策、日本政府の為替介入が注目点。' },
  BTC: { name: 'ビットコイン（BTC）', match: ['ビットコイン', 'bitcoin'],
    desc: '2009年に誕生した最初の暗号資産。発行上限は2,100万枚。米国で現物ETFが承認され、企業や機関投資家の保有が増えている。' },
  ETH: { name: 'イーサリアム（ETH）', match: ['イーサ', 'ethereum'],
    desc: 'スマートコントラクトを動かせるブロックチェーン。DeFi・NFT・ステーブルコインの多くがこの上で動く。2022年に消費電力の少ないPoSへ移行した。' },
  HYPE: { name: 'Hyperliquid（HYPE）', match: ['ハイプ', 'hyperliquid'],
    desc: 'オンチェーンの無期限先物取引所「Hyperliquid」の独自トークン。CATCHEEZの取引はこのチェーン上で行われている。取引手数料の大半がHYPEの買い戻しに使われる仕組み。' },
  SOL: { name: 'Solana（SOL）', match: ['ソラナ', 'solana'],
    desc: '高速・低コストのブロックチェーン。ミームコインやDeFiの取引が活発で、米国で現物ETFも登場した。' },
  MON: { name: 'Monad（MON）', match: ['monad', 'モナド'],
    desc: 'イーサリアム互換（EVM）で高速処理をうたう新しいL1ブロックチェーン。2025年末にメインネットとトークンを公開した。' },
};

export function allCompanyMatches(): Array<{ key: string; word: string }> {
  const out: Array<{ key: string; word: string }> = [];
  for (const [key, c] of Object.entries(COMPANIES)) {
    for (const w of c.match ?? []) out.push({ key, word: w.toLowerCase() });
    out.push({ key, word: key.toLowerCase() });
    for (const s of c.syms ?? []) out.push({ key, word: s.toLowerCase() });
  }
  // 長い語を先に(「ソフトバンク」より「ソフトバンクグループ」)
  return out.sort((a, b) => b.word.length - a.word.length);
}

/** 文章から企業を見つける(辞書の語 → 価格側の別名の順) */
export function findCompanies(text: string): string[] {
  const t = text.toLowerCase();
  const found: string[] = [];
  for (const { key, word } of allCompanyMatches()) {
    if (word.length < 2) continue;
    if (word.length <= 4 && /^[a-z0-9&]+$/.test(word)) {   // 短い英字は単語として一致した時だけ(例: "mu" が "music" に当たらない)
      if (!new RegExp('(^|[^a-z0-9])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(t)) continue;
    } else if (!t.includes(word)) continue;
    if (!found.includes(key)) found.push(key);
  }
  if (!found.length) {
    for (const [words, syms] of ALIASES) {
      if (words.some((w) => (w instanceof RegExp ? w.test(text) : t.includes(w.toLowerCase())))) {
        const k = syms.find((s) => COMPANIES[s]) ?? Object.keys(COMPANIES).find((k) => COMPANIES[k].syms?.some((s) => syms.includes(s)));
        if (k && !found.includes(k)) found.push(k);
      }
    }
  }
  return found.slice(0, 2);
}

/** 銘柄コードから辞書を引く(別コードも可) */
export function companyFor(symbol: string): { key: string; c: Company } | null {
  const s = symbol.toUpperCase();
  if (COMPANIES[s]) return { key: s, c: COMPANIES[s] };
  for (const [key, c] of Object.entries(COMPANIES)) if (c.syms?.includes(s)) return { key, c };
  return null;
}

/** 「どんな会社?」の意図があるか */
export function wantsCompanyInfo(text: string): boolean {
  return /とは|って何|何の会社|どんな|どういう|会社|企業|について|説明|教えて|紹介|概要|事業|what is|who is|about/i.test(text);
}
