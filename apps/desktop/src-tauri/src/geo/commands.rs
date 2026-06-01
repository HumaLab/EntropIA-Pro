use tauri::State;

use super::{GeoJob, GeoQueue};

#[tauri::command]
pub async fn geocode_entity(
    entity_id: String,
    geo_queue: State<'_, GeoQueue>,
) -> Result<String, String> {
    geo_queue.submit(GeoJob::GeocodeEntity { entity_id })?;
    Ok("queued".to_string())
}

#[tauri::command]
pub async fn geocode_item_entities(
    item_id: String,
    geo_queue: State<'_, GeoQueue>,
) -> Result<String, String> {
    geo_queue.submit(GeoJob::GeocodeItemEntities { item_id })?;
    Ok("queued".to_string())
}
