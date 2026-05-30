import { useCallback, useEffect, useRef, useState } from 'react';
import type { GearType, Tone } from '../lib/tone3000/types';
import { searchTones, downloadToneFile } from '../lib/tone3000/client';
import Modal from './Modal';
import { GearIcon } from './GearIcon';
import styles from './ToneBrowser.module.css';

export type BrowseTarget = 'amp' | 'ir' | 'pedal';

interface Props {
  target:      BrowseTarget;
  onLoad:      (tone: Tone, file: File) => void;
  onClose:     () => void;
}

const GEAR_OPTIONS: { value: GearType | ''; label: string }[] = [
  { value: 'amp',      label: 'Amps'      },
  { value: 'full-rig', label: 'Full rigs' },
  { value: 'ir',       label: 'IRs'       },
  { value: 'pedal',    label: 'Pedals'    },
  { value: '',         label: 'All'       },
];

const SORT_OPTIONS = [
  { value: 'downloads-all-time', label: 'Most downloaded' },
  { value: 'newest',             label: 'Newest'          },
  { value: 'trending',           label: 'Trending'        },
];

export default function ToneBrowser({ target, onLoad, onClose }: Props) {
  const defaultGear: GearType | '' = target === 'ir' ? 'ir' : target === 'pedal' ? 'pedal' : 'amp';

  const [query,      setQuery]      = useState('');
  const [gear,       setGear]       = useState<GearType | ''>(defaultGear);
  const [sort,       setSort]       = useState('downloads-all-time');
  const [tones,      setTones]      = useState<Tone[]>([]);
  const [page,       setPage]       = useState(1);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [loadingId,  setLoadingId]  = useState<number | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, g: GearType | '', s: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchTones({ q: q || undefined, gears: g || undefined, sort: s as any, page: p, page_size: 24 });
      setTones(result.data ?? []);
      setTotal(result.total ?? 0);
      setTotalPages(result.total_pages ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setTones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { doSearch(query, gear, sort, 1); }, []); // eslint-disable-line

  const handleQuery = (q: string) => {
    setQuery(q);
    setPage(1);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => doSearch(q, gear, sort, 1), 400);
  };

  const handleGear = (g: GearType | '') => { setGear(g); setPage(1); doSearch(query, g, sort, 1); };
  const handleSort = (s: string)       => { setSort(s); setPage(1); doSearch(query, gear, s, 1); };
  const handlePage = (p: number)       => { setPage(p); doSearch(query, gear, sort, p); };

  const handleLoad = async (tone: Tone) => {
    setLoadingId(tone.id);
    setError(null);
    try {
      const ext      = tone.gear === 'ir' ? '.wav' : '.nam';
      const filename = `${tone.title.replace(/[^a-z0-9]/gi, '_')}${ext}`;
      const file     = await downloadToneFile(tone.id, filename);
      onLoad(tone, file);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Modal title="BROWSE TONES" onClose={onClose} fullscreen>
      <div className={styles.inner}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            placeholder="Search amps, cabs, rigs…"
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            autoFocus
          />
          <select className={styles.filterSelect} value={gear} onChange={(e) => handleGear(e.target.value as GearType | '')}>
            {GEAR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className={styles.filterSelect} value={sort} onChange={(e) => handleSort(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {total > 0 && <span className={styles.resultCount}>{total} results</span>}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {/* Grid */}
        <div className={styles.grid}>
          {loading ? (
            <p className={styles.message}>Searching…</p>
          ) : tones.length === 0 ? (
            <p className={styles.message}>No results.</p>
          ) : (
            tones.map((tone) => (
              <div key={tone.id} className={styles.card}>
                <div className={styles.cardImgPlaceholder}>
                  <GearIcon type={tone.gear} size={56} />
                </div>
                <div className={styles.cardBody}>
                  <span className={styles.cardTitle}>{tone.title}</span>
                  <span className={styles.cardMeta}>{tone.user.username} · {tone.downloads_count} downloads</span>
                  <div className={styles.cardFooter}>
                    <span className={styles.gearTag}>{tone.gear}</span>
                    <button
                      className={styles.loadBtn}
                      onClick={() => handleLoad(tone)}
                      disabled={loadingId === tone.id}
                    >
                      {loadingId === tone.id ? '…' : 'Load'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className={styles.footer}>
            <button className={styles.pageBtn} onClick={() => handlePage(page - 1)} disabled={page <= 1}>‹ Prev</button>
            <span className={styles.pageInfo}>{page} / {totalPages}</span>
            <button className={styles.pageBtn} onClick={() => handlePage(page + 1)} disabled={page >= totalPages}>Next ›</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
