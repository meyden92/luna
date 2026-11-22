import * as exifr from 'exifr';
import sharp from 'sharp';

export type MetadataFinding = {
  category: 'gps' | 'device' | 'author' | 'software' | 'timestamp' | 'thumbnail' | 'provenance' | 'format' | 'unknown';
  label: string;
  severity: 'low' | 'medium' | 'high';
  action: 'keep' | 'unsupported';
  detail?: string;
};

export type MetadataScrubReport = {
  version: 2;
  inspectedAt: string;
  contentType: string;
  findings: MetadataFinding[];
  parser: 'sharp' | 'marker-scan';
  errors?: string[];
};

export async function inspectMetadata(buffer: Buffer, contentType: string): Promise<MetadataScrubReport> {
  if (contentType.startsWith('image/')) {
    return inspectImageMetadata(buffer, contentType);
  }

  const markers = scanMarkers(buffer, contentType);
  return {
    version: 2,
    inspectedAt: new Date().toISOString(),
    contentType,
    findings: markers.length
      ? markers
      : [
          {
            category: 'unknown',
            label: 'No supported metadata parser found for this file type.',
            severity: 'low',
            action: 'unsupported',
          },
        ],
    parser: 'marker-scan',
  };
}

async function inspectImageMetadata(buffer: Buffer, contentType: string): Promise<MetadataScrubReport> {
  const metadata = await sharp(buffer).metadata();
  const findings: MetadataFinding[] = [];
  const errors: string[] = [];
  const exifFindings = await inspectExifTags(buffer).catch((error: unknown) => {
    errors.push(error instanceof Error ? error.message : 'EXIF parser failed.');
    return [];
  });

  if (metadata.exif) findings.push({ category: 'device', label: 'EXIF metadata block is present.', severity: 'medium', action: 'keep' });
  if (metadata.iptc) findings.push({ category: 'author', label: 'IPTC metadata block is present.', severity: 'medium', action: 'keep' });
  if (metadata.xmp)
    findings.push({
      category: 'provenance',
      label: 'XMP/C2PA-style provenance metadata may be present.',
      severity: 'medium',
      action: 'keep',
    });
  if (metadata.orientation)
    findings.push({ category: 'format', label: `Orientation tag ${metadata.orientation} is present.`, severity: 'low', action: 'keep' });
  if (metadata.icc) findings.push({ category: 'format', label: 'Embedded color profile is present.', severity: 'low', action: 'keep' });
  findings.push(...exifFindings);

  return {
    version: 2,
    inspectedAt: new Date().toISOString(),
    contentType,
    findings: findings.length
      ? findings
      : [{ category: 'format', label: 'No common image metadata blocks detected.', severity: 'low', action: 'keep' }],
    parser: 'sharp',
    errors,
  };
}

async function inspectExifTags(buffer: Buffer): Promise<MetadataFinding[]> {
  const parsed = await exifr.parse(buffer, true);
  if (!parsed || typeof parsed !== 'object') return [];

  const tags = parsed as Record<string, unknown>;
  const findings: MetadataFinding[] = [];
  const keys = new Set(Object.keys(tags));
  const hasAny = (candidates: string[]) => candidates.some((candidate) => keys.has(candidate));

  if (hasAny(['latitude', 'longitude', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude'])) {
    findings.push({ category: 'gps', label: 'GPS coordinates are present.', severity: 'high', action: 'keep' });
  }
  if (hasAny(['Make', 'Model', 'LensModel', 'SerialNumber', 'BodySerialNumber'])) {
    findings.push({ category: 'device', label: 'Camera or device identifiers are present.', severity: 'medium', action: 'keep' });
  }
  if (hasAny(['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'DateCreated'])) {
    findings.push({ category: 'timestamp', label: 'Original capture or edit timestamps are present.', severity: 'medium', action: 'keep' });
  }
  if (hasAny(['Artist', 'Creator', 'By-line', 'Copyright', 'Author'])) {
    findings.push({ category: 'author', label: 'Author or copyright metadata is present.', severity: 'medium', action: 'keep' });
  }
  if (hasAny(['Software', 'ProcessingSoftware', 'CreatorTool'])) {
    findings.push({ category: 'software', label: 'Editing or encoder software metadata is present.', severity: 'low', action: 'keep' });
  }
  if (hasAny(['ThumbnailOffset', 'ThumbnailLength'])) {
    findings.push({ category: 'thumbnail', label: 'Embedded thumbnail metadata is present.', severity: 'medium', action: 'keep' });
  }

  return findings;
}

function isOfficeOpenXml(contentType: string): boolean {
  return [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ].includes(contentType);
}

function scanMarkers(buffer: Buffer, contentType: string): MetadataFinding[] {
  const head = buffer.subarray(0, Math.min(buffer.byteLength, 512_000)).toString('latin1').toLowerCase();
  const findings: MetadataFinding[] = [];

  if (head.includes('xmp') || head.includes('photoshop')) {
    findings.push({ category: 'provenance', label: 'XMP or editing metadata marker detected.', severity: 'medium', action: 'unsupported' });
  }
  if (head.includes('author') || head.includes('creator')) {
    findings.push({ category: 'author', label: 'Author/creator metadata marker detected.', severity: 'medium', action: 'unsupported' });
  }
  if (head.includes('gps')) {
    findings.push({ category: 'gps', label: 'GPS metadata marker detected.', severity: 'high', action: 'unsupported' });
  }
  if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
    findings.push({
      category: 'software',
      label: 'Media container tags may contain encoder/device metadata.',
      severity: 'medium',
      action: 'unsupported',
    });
  }
  if (contentType === 'application/pdf') {
    findings.push({
      category: 'author',
      label: 'PDF document properties may contain author or software metadata.',
      severity: 'medium',
      action: 'unsupported',
    });
  }
  if (isOfficeOpenXml(contentType)) {
    findings.push({
      category: 'author',
      label: 'Office document properties may contain author, company, and editing metadata.',
      severity: 'medium',
      action: 'unsupported',
    });
  }

  return findings;
}
