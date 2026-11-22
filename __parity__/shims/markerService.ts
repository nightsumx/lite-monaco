// platform/markers/common/markerService:Monaco 的 MarkerService 是可实例化的服务;lite-monaco 的 marker 表是全局的(src/api/markers.ts:setModelMarkers /
// getModelMarkers / onDidChangeMarkers)。这里只翻译:changeOne → setModelMarkers,read → getModelMarkers,onMarkerChanged → onDidChangeMarkers;
// dispose 清掉自己写过的 owner(同「这个服务实例随测试销毁」)。
import { setModelMarkers, getModelMarkers, removeAllMarkers, onDidChangeMarkers } from '../../src/api/markers'
import { Uri } from '../../src/api/uri'

const lift = (r: any): Uri => r instanceof Uri ? r : Uri.from({ scheme: r.scheme, authority: r.authority, path: r.path, query: r.query, fragment: r.fragment })

export class MarkerService {
    private readonly owners = new Set<string>()
    changeOne(owner: string, resource: unknown, markers: any[]) {
        this.owners.add(owner)
        setModelMarkers({ uri: lift(resource) } as never, owner, markers)
    }
    read(filter: { owner?: string, resource?: unknown, take?: number } = {}) {
        return getModelMarkers({ ...filter, resource: filter.resource ? lift(filter.resource) : undefined })
    }
    onMarkerChanged(listener: (resources: readonly Uri[]) => void) { return onDidChangeMarkers(listener) }
    dispose() { for (const o of this.owners) removeAllMarkers(o); this.owners.clear() }
}
export const IMarkerService: any = undefined
