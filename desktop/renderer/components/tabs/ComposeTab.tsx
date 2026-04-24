'use client';

import { Code, Copy, Plus } from 'lucide-react';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { AddElementMenu } from '../compose/AddElementMenu';
import { ElementCard } from '../compose/ElementCard';
import {
    ImageEditor,
    LineEditor,
    RectEditor,
    TextEditor,
} from '../compose/editors';
import { Button } from '../ui/Button';
import { Checkbox, Textarea } from '../ui/fields';
import { IconButton } from '../ui/IconButton';
import {
    defaultElement,
    newId,
    parseSpec,
    sampleElements,
    toPrintableJson,
} from '@/lib/compose';
import type {
    ComposeDoc,
    ComposeElement,
    ElementKind,
    ImageElement,
    LineElement,
    RectElement,
    TextElement,
} from '@/lib/types';

export interface ComposeTabProps {
    doc: ComposeDoc;
    setDoc: Dispatch<SetStateAction<ComposeDoc>>;
    sourceImage: HTMLImageElement | null;
    sourceImageName: string | null;
    onLog: (msg: string, kind?: '' | 'ok' | 'err') => void;
}

export function ComposeTab({ doc, setDoc, sourceImage, sourceImageName, onLog }: ComposeTabProps) {
    const [jsonOpen, setJsonOpen] = useState(false);
    const [jsonText, setJsonText] = useState('');
    const [jsonStatus, setJsonStatus] = useState<{ ok?: boolean; text: string } | null>(null);

    // Re-sync JSON when panel opens OR when doc changes while it is open.
    useEffect(() => {
        if (jsonOpen) setJsonText(toPrintableJson(doc));
    }, [jsonOpen, doc]);

    /* ------- element mutation helpers ------- */

    const patchElement = <T extends ComposeElement>(id: string, patch: Partial<T>) => {
        setDoc((d) => ({
            ...d,
            elements: d.elements.map((el) => (el.id === id ? ({ ...el, ...patch } as ComposeElement) : el)),
        }));
    };

    const addElement = (kind: ElementKind) => {
        setDoc((d) => ({ ...d, elements: [...d.elements, defaultElement(kind)] }));
    };

    const moveElement = (id: string, dir: -1 | 1) => {
        setDoc((d) => {
            const i = d.elements.findIndex((e) => e.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= d.elements.length) return d;
            const next = d.elements.slice();
            [next[i], next[j]] = [next[j], next[i]];
            return { ...d, elements: next };
        });
    };

    const duplicateElement = (id: string) => {
        setDoc((d) => {
            const i = d.elements.findIndex((e) => e.id === id);
            if (i < 0) return d;
            const clone = { ...d.elements[i], id: newId() };
            const next = d.elements.slice();
            next.splice(i + 1, 0, clone);
            return { ...d, elements: next };
        });
    };

    const deleteElement = (id: string) => {
        setDoc((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
    };

    /* ------- JSON escape hatch ------- */

    const applyJson = () => {
        try {
            const doc2 = parseSpec(jsonText);
            setDoc(doc2);
            setJsonStatus({ ok: true, text: 'Applied.' });
            onLog('compose JSON applied', 'ok');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setJsonStatus({ ok: false, text: `Invalid: ${message}` });
            onLog(`compose JSON invalid: ${message}`, 'err');
        }
    };

    const copyJson = async () => {
        try {
            await navigator.clipboard.writeText(toPrintableJson(doc));
            setJsonStatus({ ok: true, text: 'Copied to clipboard.' });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setJsonStatus({ ok: false, text: `Copy failed: ${message}` });
        }
    };

    const loadSample = () => {
        setDoc({ background: 'white', border: true, elements: sampleElements() });
        setJsonStatus(null);
        onLog('sample compose loaded', 'ok');
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Canvas-wide switches */}
            <div className="flex flex-wrap gap-4 px-2.5 py-2 bg-surface-2 border border-border rounded">
                <Checkbox
                    checked={doc.background === 'black'}
                    onCheckedChange={(v) => setDoc((d) => ({ ...d, background: v ? 'black' : 'white' }))}
                    label="Black background"
                />
                <Checkbox
                    checked={doc.border}
                    onCheckedChange={(v) => setDoc((d) => ({ ...d, border: v }))}
                    label="Outer border"
                />
            </div>

            {/* Elements header */}
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    Elements
                </span>
                <AddElementMenu onAdd={addElement} hasSourceImage={!!sourceImage} />
            </div>

            {/* Elements list */}
            {doc.elements.length === 0 ? (
                <p className="text-center py-4 px-2 m-0 border border-dashed border-border rounded-md text-fg-muted text-sm">
                    No elements yet. Press <Plus size={12} className="inline-block align-[-2px] opacity-80" /> to add one.
                </p>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {doc.elements.map((el, idx) => (
                        <ElementCard
                            key={el.id}
                            element={el}
                            canMoveUp={idx > 0}
                            canMoveDown={idx < doc.elements.length - 1}
                            onMove={(dir) => moveElement(el.id, dir)}
                            onDuplicate={() => duplicateElement(el.id)}
                            onDelete={() => deleteElement(el.id)}
                        >
                            {el.kind === 'text' && (
                                <TextEditor el={el as TextElement} onChange={(p) => patchElement<TextElement>(el.id, p)} />
                            )}
                            {el.kind === 'rect' && (
                                <RectEditor el={el as RectElement} onChange={(p) => patchElement<RectElement>(el.id, p)} />
                            )}
                            {el.kind === 'line' && (
                                <LineEditor el={el as LineElement} onChange={(p) => patchElement<LineElement>(el.id, p)} />
                            )}
                            {el.kind === 'image' && (
                                <ImageEditor
                                    el={el as ImageElement}
                                    onChange={(p) => patchElement<ImageElement>(el.id, p)}
                                    sourceName={sourceImageName}
                                />
                            )}
                        </ElementCard>
                    ))}
                </div>
            )}

            {/* JSON escape hatch */}
            <details
                open={jsonOpen}
                onToggle={(e) => setJsonOpen((e.target as HTMLDetailsElement).open)}
                className="mt-2 border border-border rounded bg-surface-2"
            >
                <summary
                    className={
                        'flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer select-none ' +
                        'text-sm text-fg-muted hover:text-fg hover:bg-surface-3 ' +
                        'rounded list-none [&::-webkit-details-marker]:hidden'
                    }
                >
                    <Code size={14} />
                    <span>Show JSON</span>
                    <span className="text-sm text-fg-subtle">— advanced / import / export</span>
                </summary>
                <div className="p-2.5 flex flex-col gap-2 border-t border-border">
                    <Textarea
                        rows={10}
                        value={jsonText}
                        onChange={(e) => setJsonText(e.target.value)}
                    />
                    <div className="flex gap-2 items-center">
                        <Button onClick={loadSample} title="Replace the list with a working sample">Load sample</Button>
                        <Button onClick={applyJson} title="Apply the JSON above to the visual editor">Apply</Button>
                        <IconButton
                            icon={<Copy size={14} />}
                            aria-label="Copy JSON"
                            title="Copy JSON to clipboard"
                            onClick={copyJson}
                        />
                    </div>
                    {jsonStatus && (
                        <p
                            className={
                                'm-0 min-h-[14px] text-xs font-mono ' +
                                (jsonStatus.ok ? 'text-ok' : 'text-err')
                            }
                        >
                            {jsonStatus.text}
                        </p>
                    )}
                </div>
            </details>
        </div>
    );
}
