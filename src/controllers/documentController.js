import { query } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { getFileExtension, getFileType } from '../utils/helpers.js';

/**
 * Get documents for a movement
 */
export const getDocuments = async (req, res) => {
  try {
    const { accountId, movementId } = req.params;

    // Verify movement belongs to account
    const movementCheck = await query(
      'SELECT id_movimiento FROM movimientos WHERE id_movimiento = $1 AND id_cuenta = $2',
      [movementId, accountId]
    );

    if (movementCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Movement not found.' });
    }

    const result = await query(
      'SELECT * FROM documentos_adjuntos WHERE id_movimiento = $1 ORDER BY created_at DESC',
      [movementId]
    );

    const documents = result.rows.map(d => ({
      id: d.id_documento,
      urlArchivo: d.url_archivo,
      nombreArchivo: d.nombre_archivo,
      tipoArchivo: d.tipo_archivo,
      origen: d.origen,
      tamano: d.tamano_bytes,
      createdAt: d.created_at
    }));

    res.json({ documents });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to get documents.' });
  }
};

/**
 * Upload document for a movement
 */
export const uploadDocument = async (req, res) => {
  try {
    const { accountId, movementId } = req.params;
    const { origen } = req.body;

    // Verify movement belongs to account
    const movementCheck = await query(
      'SELECT id_movimiento FROM movimientos WHERE id_movimiento = $1 AND id_cuenta = $2',
      [movementId, accountId]
    );

    if (movementCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Movement not found.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const file = req.file;
    const extension = getFileExtension(file.originalname);
    const fileType = getFileType(extension);

    const result = await query(
      `INSERT INTO documentos_adjuntos (id_movimiento, url_archivo, nombre_archivo, tipo_archivo, origen, tamano_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        movementId,
        file.path.replace(/\\/g, '/'),
        file.originalname,
        fileType,
        origen || 'subida_manual',
        file.size
      ]
    );

    const document = result.rows[0];

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: document.id_documento,
        urlArchivo: document.url_archivo,
        nombreArchivo: document.nombre_archivo,
        tipoArchivo: document.tipo_archivo,
        origen: document.origen,
        tamano: document.tamano_bytes
      }
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Failed to upload document.' });
  }
};

/**
 * Upload multiple documents
 */
export const uploadMultipleDocuments = async (req, res) => {
  try {
    const { accountId, movementId } = req.params;
    const { origen } = req.body;

    // Verify movement belongs to account
    const movementCheck = await query(
      'SELECT id_movimiento FROM movimientos WHERE id_movimiento = $1 AND id_cuenta = $2',
      [movementId, accountId]
    );

    if (movementCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Movement not found.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const uploadedDocs = [];

    for (const file of req.files) {
      const extension = getFileExtension(file.originalname);
      const fileType = getFileType(extension);

      const result = await query(
        `INSERT INTO documentos_adjuntos (id_movimiento, url_archivo, nombre_archivo, tipo_archivo, origen, tamano_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          movementId,
          file.path.replace(/\\/g, '/'),
          file.originalname,
          fileType,
          origen || 'subida_manual',
          file.size
        ]
      );

      uploadedDocs.push({
        id: result.rows[0].id_documento,
        nombreArchivo: result.rows[0].nombre_archivo,
        tipoArchivo: result.rows[0].tipo_archivo
      });
    }

    res.status(201).json({
      message: `${uploadedDocs.length} documents uploaded successfully`,
      documents: uploadedDocs
    });
  } catch (error) {
    console.error('Upload multiple documents error:', error);
    res.status(500).json({ error: 'Failed to upload documents.' });
  }
};

/**
 * Delete document
 */
export const deleteDocument = async (req, res) => {
  try {
    const { accountId, movementId, documentId } = req.params;

    // Verify movement belongs to account
    const movementCheck = await query(
      'SELECT id_movimiento FROM movimientos WHERE id_movimiento = $1 AND id_cuenta = $2',
      [movementId, accountId]
    );

    if (movementCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Movement not found.' });
    }

    // Get document to delete file
    const docResult = await query(
      'SELECT url_archivo FROM documentos_adjuntos WHERE id_documento = $1 AND id_movimiento = $2',
      [documentId, movementId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const filePath = docResult.rows[0].url_archivo;

    // Delete from database
    await query(
      'DELETE FROM documentos_adjuntos WHERE id_documento = $1',
      [documentId]
    );

    // Try to delete file from filesystem
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      console.error('Error deleting file:', fileError);
      // Continue even if file deletion fails
    }

    res.json({ message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
};

/**
 * Get document by ID (for download)
 */
export const getDocumentById = async (req, res) => {
  try {
    const { documentId } = req.params;

    const result = await query(
      `SELECT d.*, m.id_cuenta
       FROM documentos_adjuntos d
       JOIN movimientos m ON d.id_movimiento = m.id_movimiento
       WHERE d.id_documento = $1`,
      [documentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const document = result.rows[0];

    // Check user has access to the account
    if (!req.user.isAdmin) {
      const accessCheck = await query(
        'SELECT id FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
        [document.id_cuenta, req.user.id]
      );

      if (accessCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    // Return file path for download
    const filePath = path.resolve(document.url_archivo);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server.' });
    }

    res.download(filePath, document.nombre_archivo);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Failed to get document.' });
  }
};
