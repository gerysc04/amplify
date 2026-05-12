import { useCallback, useEffect, useRef, useState } from 'react';
import type { GearType, Tone } from '../lib/tone3000/types';
import {
  isAuthenticated, startOAuth, logout,
  searchTones, downloadToneFile,
} from '../lib/tone3000/client';
import styles from './AmpBrowser.module.css';

interface Props {
  onLoadModel: (file: File, gearType: GearType) => void;
  onLoadIr:    (file: File) => void;
}

const GEAR_OPTIONS: { value: GearType | ''; label: string }[] = [
  { value: '',          label: 'All'      },
  { value: 'amp',       label: 'Amps'     },
  { value: 'full-rig',  label: 'Full rigs'},
  { value: 'ir',        label: 'IRs'      },
];

export default function AmpBrowser({ onLoadModel, onLoadIr }: Props) {
  const [authed,    setAuthed]    = useState(isAuthenticated);
  const [query,     setQuery]     = useState('');
  const [gear,      setGear]      = useState<GearType | ''>('amp');
  const [tones,     setTones]     = useState<Tone[]>([]);
  const [page,      setPage]      = useState(1);
  const [totalPages,setTotalPages]= useState(0);
  const [loading,   setLoading]   = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, g: GearType | '', p: number) => {
    if (!isAuthenticated()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await searchTones({ q: q || undefined, gears: g || undefined, page: p, page_size: 20 });
      setTones(result.data ?? []);
      setTotalPages(result.total_pages ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setTones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial search when authenticated
  useEffect(() => {
    if (authed) doSearch(query, gear, page);
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQueryChange = (q: string) => {
    setQuery(q);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q, gear, 1), 400);
  };

  const handleGearChange = (g: GearType | '') => {
    setGear(g);
    setPage(1);
    doSearch(query, g, 1);
  };

  const handlePage = (p: number) => {
    setPage(p);
    doSearch(query, gear, p);
  };

  const handleLoad = async (tone: Tone) => {
    setLoadingId(tone.id);
    setError(null);
    try {
      const ext      = tone.gear === 'ir' ? '.wav' : '.nam';
      const filename = `${tone.title.replace(/[^a-z0-9]/gi, '_')}${ext}`;
      const file     = await downloadToneFile(tone.id, filename);
      if (tone.gear === 'ir') {
        onLoadIr(file);
      } else {
        onLoadModel(file, tone.gear);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setLoadingId(null);
    }
  };

  const handleConnect = () => startOAuth();

  const handleDisconnect = () => {
    logout();
    setAuthed(false);
    setTones([]);
  };

  if (!authed) {
    return (
      <div className={styles.browser}>
        <div className={styles.header}>
          <span className={styles.title}>TONES</span>
          <button className={styles.connectBtn} onClick={handleConnect}>
            Connect tone3000
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.browser}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>TONES</span>
        <span className={styles.userBadge}>
          <span className={styles.username}>tone3000</span> connected
        </span>
        <button className={styles.disconnectBtn} onClick={handleDisconnect} title="Disconnect">✕</button>
      </div>

      {/* Search bar */}
      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          placeholder="Search amps, cabs…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={gear}
          onChange={(e) => handleGearChange(e.target.value as GearType | '')}
        >
          {GEAR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Results */}
      {error && <p className={styles.error}>{error}</p>}
      {loading && <p className={styles.message}>Searching…</p>}

      {!loading && (
        <div className={styles.results}>
          {tones.length === 0 ? (
            <p className={styles.message}>No results.</p>
          ) : (
            tones.map((tone) => (
              <div key={tone.id} className={styles.tone}>
                <div className={styles.toneInfo}>
                  <span className={styles.toneName}>{tone.title}</span>
                  <span className={styles.toneMeta}>{tone.user.username} · {tone.downloads_count} downloads</span>
                </div>
                <span className={styles.gearTag}>{tone.gear}</span>
                <button
                  className={styles.loadBtn}
                  onClick={() => handleLoad(tone)}
                  disabled={loadingId === tone.id}
                >
                  {loadingId === tone.id ? '…' : 'Load'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} onClick={() => handlePage(page - 1)} disabled={page <= 1}>‹</button>
          <span className={styles.pageInfo}>{page} / {totalPages}</span>
          <button className={styles.pageBtn} onClick={() => handlePage(page + 1)} disabled={page >= totalPages}>›</button>
        </div>
      )}
    </div>
  );
}
