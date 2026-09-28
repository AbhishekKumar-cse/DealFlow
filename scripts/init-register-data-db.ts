// Also log a CREATE audit entry.
      const newId = (
        db
          .prepare('SELECT id FROM RegisterData WHERE lower(email) = lower(?) LIMIT 1')
          .get(old.email) as { id: number }
      ).id;
      db.prepare(`
        INSERT INTO RegisterAuditLog (registerId, action, fieldName, oldValue, newValue, changedBy, reason, createdAt)
        VALUES (?, 'CREATE', NULL, NULL, ?, 'system', 'Migrated from logic_details_db', ?)
      `).run(newId, fullName, old.createdAt);

      migrated++;
      console.log(  ✓ Migrated ${old.email} → RegisterData id=${newId});
    }
    console.log(✓ Migrated ${migrated} registration(s).);
  } finally {
    oldDb.close();
  }
} else {
  console.log('');
  console.log('(No logic_details.db found — skipping migration.)');
}

console.log('');
console.log('✅ register_data_db ready at:', newDbPath);
db.close();